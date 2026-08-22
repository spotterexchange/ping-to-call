// Typed client for the Worker API. All requests are same-origin and rely on the
// HttpOnly session cookie, so nothing here handles tokens directly.

export interface Me {
  user: { id: string; email: string; displayName: string | null; timezone: string; phone: string | null };
  setup: {
    hasPhone: boolean;
    hasTwilio: boolean;
    twilioVerified: boolean;
    hasIngestToken: boolean;
    senderCount: number;
  };
}

export interface Sender {
  id: string;
  display_name: string | null;
  email: string | null;
  enabled: number;
  created_at: number;
}

export interface Settings {
  master_mute: number;
  min_seconds_between_calls: number;
}

export interface Schedule {
  id: string;
  kind: "active" | "quiet";
  days_mask: number;
  start_min: number;
  end_min: number;
}

export interface CallLogRow {
  id: string;
  sender: string | null;
  is_mention: number;
  decision: string;
  call_sid: string | null;
  created_at: number;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.ok === false) {
    throw new ApiError((data.error as string) || `HTTP ${res.status}`, res.status);
  }
  return data as T;
}

export const api = {
  me: () => req<{ ok: true } & Me>("GET", "/api/me"),
  login: (email: string, password: string) => req("POST", "/api/auth/login", { email, password }),
  signup: (email: string, password: string) => req("POST", "/api/auth/signup", { email, password }),
  logout: () => req("POST", "/api/auth/logout"),
  setProfile: (phone?: string, timezone?: string) =>
    req("POST", "/api/profile", { phone, timezone }),
  setTwilio: (accountSid: string, authToken: string, from: string) =>
    req("PUT", "/api/twilio", { accountSid, authToken, from }),
  testCall: () => req<{ ok: true; callSid: string }>("POST", "/api/test-call"),
  listSenders: () => req<{ ok: true; senders: Sender[] }>("GET", "/api/senders"),
  addSender: (displayName?: string, email?: string) =>
    req<{ ok: true; sender: Sender }>("POST", "/api/senders", { displayName, email }),
  updateSender: (id: string, fields: { enabled?: boolean; displayName?: string; email?: string }) =>
    req("PATCH", `/api/senders/${id}`, fields),
  deleteSender: (id: string) => req("DELETE", `/api/senders/${id}`),
  getSettings: () => req<{ ok: true; settings: Settings }>("GET", "/api/settings"),
  updateSettings: (fields: { masterMute?: boolean; minSecondsBetweenCalls?: number }) =>
    req("PATCH", "/api/settings", fields),
  listSchedules: () => req<{ ok: true; schedules: Schedule[] }>("GET", "/api/schedules"),
  addSchedule: (kind: "active" | "quiet", daysMask: number, startMin: number, endMin: number) =>
    req<{ ok: true; schedule: Schedule }>("POST", "/api/schedules", { kind, daysMask, startMin, endMin }),
  deleteSchedule: (id: string) => req("DELETE", `/api/schedules/${id}`),
  flowCondition: () =>
    req<{ ok: true; condition: string; ingestUrl: string; bodyTemplate: string }>("GET", "/api/flow-condition"),
  regenIngestToken: () =>
    req<{ ok: true; token: string; ingestUrl: string }>("POST", "/api/ingest-token"),
  callLog: () => req<{ ok: true; calls: CallLogRow[] }>("GET", "/api/call-log"),
  deleteAccount: () => req("DELETE", "/api/account"),
};
