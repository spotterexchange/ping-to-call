/** Shared types for the Ping-to-Call Worker. */

export interface Env {
  // Bindings
  DB: D1Database;
  PING_KV: KVNamespace;

  // Secrets (wrangler secret put ...)
  ENC_KEY: string; // base64 of 32 random bytes — encrypts stored Twilio creds
  SESSION_SECRET: string; // HMAC key for signed session cookies

  // Vars (wrangler.toml [vars])
  APP_BASE_URL: string; // e.g. https://ping-to-call.example.workers.dev
}

export interface User {
  id: string;
  email: string;
  email_lower: string;
  password_hash: string;
  display_name: string | null;
  timezone: string;
  phone_e164: string | null;
  created_at: number;
}

export interface TwilioConfig {
  user_id: string;
  account_sid_enc: string;
  api_key_sid_enc: string | null;
  auth_token_enc: string;
  from_number: string;
  verified_at: number | null;
}

export interface Sender {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  enabled: number; // 0 | 1
  created_at: number;
}

export interface Settings {
  user_id: string;
  master_mute: number; // 0 | 1
  min_seconds_between_calls: number;
  updated_at: number;
}

export type ScheduleKind = "active" | "quiet";

export interface Schedule {
  id: string;
  user_id: string;
  kind: ScheduleKind;
  days_mask: number; // bit 0 = Sunday ... bit 6 = Saturday
  start_min: number; // minutes from local midnight
  end_min: number;
  created_at: number;
}

export interface CallLogRow {
  id: string;
  user_id: string;
  sender: string | null;
  is_mention: number;
  decision: string;
  call_sid: string | null;
  created_at: number;
}

/** Metadata-only payload the detector flow POSTs to /ingest. No message content. */
export interface IngestPayload {
  sender?: string;
  senderEmail?: string;
  isMention?: boolean;
  isDirectMessage?: boolean;
  messageId?: string;
  timestamp?: string;
}
