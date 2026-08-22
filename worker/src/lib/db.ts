import type {
  CallLogRow,
  Schedule,
  ScheduleKind,
  Sender,
  Settings,
  TwilioConfig,
  User,
} from "../types";
import { nowSec, uuid } from "./util";

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
  return db
    .prepare("SELECT * FROM users WHERE email_lower = ?")
    .bind(email.trim().toLowerCase())
    .first<User>();
}

export async function getUserById(db: D1Database, id: string): Promise<User | null> {
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<User>();
}

/** Create a new user with a hashed password and seed their settings row. */
export async function createUser(
  db: D1Database,
  email: string,
  passwordHash: string,
): Promise<User> {
  const id = uuid();
  const created_at = nowSec();
  const emailLower = email.trim().toLowerCase();
  await db
    .prepare(
      "INSERT INTO users (id, email, email_lower, password_hash, display_name, timezone, phone_e164, created_at) VALUES (?, ?, ?, ?, NULL, 'UTC', NULL, ?)",
    )
    .bind(id, email.trim(), emailLower, passwordHash, created_at)
    .run();
  await db
    .prepare(
      "INSERT INTO settings (user_id, master_mute, min_seconds_between_calls, updated_at) VALUES (?, 0, 120, ?)",
    )
    .bind(id, created_at)
    .run();
  return {
    id,
    email: email.trim(),
    email_lower: emailLower,
    password_hash: passwordHash,
    display_name: null,
    timezone: "UTC",
    phone_e164: null,
    created_at,
  };
}

export async function updateUserProfile(
  db: D1Database,
  userId: string,
  fields: { phone_e164?: string | null; timezone?: string },
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (fields.phone_e164 !== undefined) {
    sets.push("phone_e164 = ?");
    vals.push(fields.phone_e164);
  }
  if (fields.timezone !== undefined) {
    sets.push("timezone = ?");
    vals.push(fields.timezone);
  }
  if (sets.length === 0) return;
  vals.push(userId);
  await db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
}

export async function deleteUser(db: D1Database, userId: string): Promise<void> {
  // FK ON DELETE CASCADE clears child tables.
  await db.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
}

// ---------------------------------------------------------------------------
// Twilio config
// ---------------------------------------------------------------------------

export async function getTwilioConfig(
  db: D1Database,
  userId: string,
): Promise<TwilioConfig | null> {
  return db
    .prepare("SELECT * FROM twilio_config WHERE user_id = ?")
    .bind(userId)
    .first<TwilioConfig>();
}

export async function upsertTwilioConfig(
  db: D1Database,
  userId: string,
  accountSidEnc: string,
  authTokenEnc: string,
  fromNumber: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO twilio_config (user_id, account_sid_enc, auth_token_enc, from_number, verified_at)
       VALUES (?, ?, ?, ?, NULL)
       ON CONFLICT(user_id) DO UPDATE SET
         account_sid_enc = excluded.account_sid_enc,
         auth_token_enc = excluded.auth_token_enc,
         from_number = excluded.from_number`,
    )
    .bind(userId, accountSidEnc, authTokenEnc, fromNumber)
    .run();
}

export async function markTwilioVerified(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare("UPDATE twilio_config SET verified_at = ? WHERE user_id = ?")
    .bind(nowSec(), userId)
    .run();
}

// ---------------------------------------------------------------------------
// Senders
// ---------------------------------------------------------------------------

export async function listSenders(db: D1Database, userId: string): Promise<Sender[]> {
  const res = await db
    .prepare("SELECT * FROM senders WHERE user_id = ? ORDER BY created_at")
    .bind(userId)
    .all<Sender>();
  return res.results ?? [];
}

export async function addSender(
  db: D1Database,
  userId: string,
  displayName: string | null,
  email: string | null,
): Promise<Sender> {
  const id = uuid();
  const created_at = nowSec();
  await db
    .prepare(
      "INSERT INTO senders (id, user_id, display_name, email, enabled, created_at) VALUES (?, ?, ?, ?, 1, ?)",
    )
    .bind(id, userId, displayName, email, created_at)
    .run();
  return { id, user_id: userId, display_name: displayName, email, enabled: 1, created_at };
}

export async function updateSender(
  db: D1Database,
  userId: string,
  senderId: string,
  fields: { enabled?: boolean; display_name?: string | null; email?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (fields.enabled !== undefined) {
    sets.push("enabled = ?");
    vals.push(fields.enabled ? 1 : 0);
  }
  if (fields.display_name !== undefined) {
    sets.push("display_name = ?");
    vals.push(fields.display_name);
  }
  if (fields.email !== undefined) {
    sets.push("email = ?");
    vals.push(fields.email);
  }
  if (sets.length === 0) return;
  vals.push(senderId, userId);
  await db
    .prepare(`UPDATE senders SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`)
    .bind(...vals)
    .run();
}

export async function deleteSender(
  db: D1Database,
  userId: string,
  senderId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM senders WHERE id = ? AND user_id = ?")
    .bind(senderId, userId)
    .run();
}

/** Find an enabled sender for this user matching the incoming identity. */
export function matchEnabledSender(
  senders: Sender[],
  sender?: string,
  senderEmail?: string,
): Sender | null {
  const name = (sender || "").trim().toLowerCase();
  const email = (senderEmail || "").trim().toLowerCase();
  for (const s of senders) {
    if (!s.enabled) continue;
    const sEmail = (s.email || "").toLowerCase();
    const sName = (s.display_name || "").toLowerCase();
    if (email && sEmail && email === sEmail) return s;
    if (name && sName && (name === sName || name.includes(sName))) return s;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettings(db: D1Database, userId: string): Promise<Settings> {
  const s = await db
    .prepare("SELECT * FROM settings WHERE user_id = ?")
    .bind(userId)
    .first<Settings>();
  if (s) return s;
  const updated_at = nowSec();
  const def: Settings = {
    user_id: userId,
    master_mute: 0,
    min_seconds_between_calls: 120,
    updated_at,
  };
  await db
    .prepare(
      "INSERT INTO settings (user_id, master_mute, min_seconds_between_calls, updated_at) VALUES (?, 0, 120, ?)",
    )
    .bind(userId, updated_at)
    .run();
  return def;
}

export async function updateSettings(
  db: D1Database,
  userId: string,
  fields: { master_mute?: boolean; min_seconds_between_calls?: number },
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (fields.master_mute !== undefined) {
    sets.push("master_mute = ?");
    vals.push(fields.master_mute ? 1 : 0);
  }
  if (fields.min_seconds_between_calls !== undefined) {
    sets.push("min_seconds_between_calls = ?");
    vals.push(Math.max(0, Math.floor(fields.min_seconds_between_calls)));
  }
  sets.push("updated_at = ?");
  vals.push(nowSec());
  vals.push(userId);
  await db
    .prepare(`UPDATE settings SET ${sets.join(", ")} WHERE user_id = ?`)
    .bind(...vals)
    .run();
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

export async function listSchedules(db: D1Database, userId: string): Promise<Schedule[]> {
  const res = await db
    .prepare("SELECT * FROM schedules WHERE user_id = ? ORDER BY created_at")
    .bind(userId)
    .all<Schedule>();
  return res.results ?? [];
}

export async function addSchedule(
  db: D1Database,
  userId: string,
  kind: ScheduleKind,
  daysMask: number,
  startMin: number,
  endMin: number,
): Promise<Schedule> {
  const id = uuid();
  const created_at = nowSec();
  await db
    .prepare(
      "INSERT INTO schedules (id, user_id, kind, days_mask, start_min, end_min, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, userId, kind, daysMask, startMin, endMin, created_at)
    .run();
  return { id, user_id: userId, kind, days_mask: daysMask, start_min: startMin, end_min: endMin, created_at };
}

export async function deleteSchedule(
  db: D1Database,
  userId: string,
  scheduleId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM schedules WHERE id = ? AND user_id = ?")
    .bind(scheduleId, userId)
    .run();
}

// ---------------------------------------------------------------------------
// Ingest tokens
// ---------------------------------------------------------------------------

export async function setIngestToken(
  db: D1Database,
  userId: string,
  tokenHash: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ingest_tokens (user_id, token_hash, created_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at`,
    )
    .bind(userId, tokenHash, nowSec())
    .run();
}

export async function getUserIdByTokenHash(
  db: D1Database,
  tokenHash: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT user_id FROM ingest_tokens WHERE token_hash = ?")
    .bind(tokenHash)
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

export async function hasIngestToken(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS x FROM ingest_tokens WHERE user_id = ?")
    .bind(userId)
    .first<{ x: number }>();
  return Boolean(row);
}

// ---------------------------------------------------------------------------
// Call log
// ---------------------------------------------------------------------------

export async function addCallLog(
  db: D1Database,
  userId: string,
  sender: string | null,
  isMention: boolean,
  decision: string,
  callSid: string | null,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO call_log (id, user_id, sender, is_mention, decision, call_sid, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(uuid(), userId, sender, isMention ? 1 : 0, decision, callSid, nowSec())
    .run();
}

export async function listCallLog(
  db: D1Database,
  userId: string,
  limit = 50,
): Promise<CallLogRow[]> {
  const res = await db
    .prepare("SELECT * FROM call_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
    .bind(userId, Math.min(200, Math.max(1, limit)))
    .all<CallLogRow>();
  return res.results ?? [];
}
