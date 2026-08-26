import { xmlEscape } from "./util";

const SAY_VOICE = "Polly.Joanna";

export interface CallAnnouncement {
  senderName: string;
  isMention: boolean;
}

/**
 * Build the TwiML the call speaks. Metadata only — we never receive or speak the
 * message text, just who pinged and whether it was a direct message or an @mention.
 */
export function buildTwiml(a: CallAnnouncement): string {
  const name = a.senderName?.trim() || "someone";
  const action = a.isMention ? "mentioned you in" : "sent you a direct message on";
  const line = `Urgent. ${name} ${action} Microsoft Teams. Check now.`;
  const say = (t: string) => `<Say voice="${xmlEscape(SAY_VOICE)}">${xmlEscape(t)}</Say>`;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    say(line) +
    `<Pause length="1"/>` +
    say("Repeating.") +
    say(line) +
    `</Response>`
  );
}

export interface TwilioCreds {
  accountSid: string;
  /** API Key SID (SK…). When present, used as the Basic-auth username. */
  apiKeySid?: string | null;
  /** API Key Secret when apiKeySid is set, otherwise the account Auth Token. */
  authToken: string;
  from: string;
}

export interface PlaceCallResult {
  ok: boolean;
  status: number;
  callSid: string | null;
  detail?: string;
}

/** Place an outbound call via Twilio's REST API using the given user's credentials. */
export async function placeCall(
  creds: TwilioCreds,
  to: string,
  twiml: string,
): Promise<PlaceCallResult> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(creds.accountSid)}/Calls.json`;
  const form = new URLSearchParams({ To: to, From: creds.from, Twiml: twiml });

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + btoa(`${creds.apiKeySid || creds.accountSid}:${creds.authToken}`),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  if (!resp.ok) {
    return { ok: false, status: resp.status, callSid: null, detail: await resp.text() };
  }
  const data = (await resp.json()) as { sid?: string };
  return { ok: true, status: resp.status, callSid: data.sid ?? null };
}
