import { useEffect, useState } from "react";
import { api, type Schedule, type Sender } from "./api";
import { CodeBlock, Field, Toggle, useAction } from "./ui";
import { DAY_LABELS, daysMaskToLabels, guessTimezone, hhmmToMinutes, minutesToHHMM } from "./helpers";

// ---------------------------------------------------------------------------
// Phone + timezone
// ---------------------------------------------------------------------------
export function PhoneForm(props: { initialPhone: string | null; initialTz: string; onSaved: () => void }) {
  const [phone, setPhone] = useState(props.initialPhone || "");
  const [tz, setTz] = useState(props.initialTz && props.initialTz !== "UTC" ? props.initialTz : guessTimezone());
  const act = useAction();
  return (
    <div>
      <Field label="Your cell phone (E.164, e.g. +15551234567)" type="tel" value={phone} onChange={setPhone} placeholder="+15551234567" />
      <Field label="Your timezone (used for quiet/active hours)" value={tz} onChange={setTz} placeholder="America/New_York" />
      <div className="row">
        <button className="btn primary" disabled={act.pending} onClick={() => act.run(async () => {
          await api.setProfile(phone.trim(), tz.trim());
          props.onSaved();
        }, "Saved")}>
          {act.pending ? "Saving…" : "Save"}
        </button>
        {act.error && <span className="err">{act.error}</span>}
        {act.ok && <span className="ok">{act.ok}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Twilio credentials + test call
// ---------------------------------------------------------------------------
export function TwilioForm(props: { onSaved: () => void; canTest: boolean }) {
  const [sid, setSid] = useState("");
  const [token, setToken] = useState("");
  const [from, setFrom] = useState("");
  const save = useAction();
  const test = useAction();
  return (
    <div>
      <Field label="Twilio Account SID" value={sid} onChange={setSid} placeholder="AC…" />
      <Field label="Twilio Auth Token" type="password" value={token} onChange={setToken} placeholder="••••••••" />
      <Field label="Twilio phone number (E.164)" type="tel" value={from} onChange={setFrom} placeholder="+15551234567" />
      <div className="row">
        <button className="btn primary" disabled={save.pending} onClick={() => save.run(async () => {
          await api.setTwilio(sid.trim(), token.trim(), from.trim());
          props.onSaved();
        }, "Credentials saved (encrypted)")}>
          {save.pending ? "Saving…" : "Save credentials"}
        </button>
        <button className="btn" disabled={test.pending || !props.canTest} title={props.canTest ? "" : "Save credentials and your phone first"} onClick={() => test.run(async () => {
          await api.testCall();
        }, "Calling your phone now…")}>
          {test.pending ? "Calling…" : "Send test call"}
        </button>
      </div>
      {save.error && <p className="err">{save.error}</p>}
      {save.ok && <p className="ok">{save.ok}</p>}
      {test.error && <p className="err">{test.error}</p>}
      {test.ok && <p className="ok">{test.ok}</p>}
      <p className="muted" style={{ fontSize: 13 }}>
        Credentials are encrypted at rest. On a Twilio trial you can only call verified numbers.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Senders editor
// ---------------------------------------------------------------------------
export function SendersEditor(props: { onChange?: () => void }) {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const add = useAction();

  async function reload() {
    const r = await api.listSenders();
    setSenders(r.senders);
    props.onChange?.();
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, []);

  return (
    <div>
      <ul className="list">
        {senders.length === 0 && <li className="muted">No senders yet. Add the people who should trigger a call.</li>}
        {senders.map((s) => (
          <li key={s.id}>
            <div className="who">
              <strong>{s.display_name || s.email || "(unnamed)"}</strong>
              {s.email && s.display_name && <small>{s.email}</small>}
            </div>
            <div className="spacer" />
            <Toggle checked={!!s.enabled} onChange={(v) => { void (async () => { await api.updateSender(s.id, { enabled: v }); await reload(); })(); }} label={s.enabled ? "On" : "Off"} />
            <button className="btn danger" onClick={() => { void (async () => { await api.deleteSender(s.id); await reload(); })(); }}>Remove</button>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 12 }}>
        <div className="row">
          <input type="text" placeholder="Display name (e.g. Jane Boss)" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
          <input type="text" placeholder="Email (recommended)" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
          <button className="btn primary" disabled={add.pending || (!name.trim() && !email.trim())} onClick={() => add.run(async () => {
            await api.addSender(name.trim() || undefined, email.trim() || undefined);
            setName(""); setEmail("");
            await reload();
          })}>Add</button>
        </div>
        {add.error && <p className="err">{add.error}</p>}
        <p className="muted" style={{ fontSize: 13 }}>
          Email gives the most reliable match. After adding or removing someone, update your Power Automate
          condition (see “Connect Teams”).
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schedule editor
// ---------------------------------------------------------------------------
export function ScheduleEditor() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [kind, setKind] = useState<"quiet" | "active">("quiet");
  const [start, setStart] = useState("22:00");
  const [end, setEnd] = useState("07:00");
  const [days, setDays] = useState(127);
  const add = useAction();

  async function reload() { setSchedules((await api.listSchedules()).schedules); }
  useEffect(() => { void reload(); }, []);

  function toggleDay(i: number) { setDays((d) => d ^ (1 << i)); }

  return (
    <div>
      <ul className="list">
        {schedules.length === 0 && <li className="muted">No schedule rules. Calls are allowed at all hours.</li>}
        {schedules.map((s) => (
          <li key={s.id}>
            <div className="who">
              <strong>{s.kind === "quiet" ? "Quiet" : "Active"} {minutesToHHMM(s.start_min)}–{minutesToHHMM(s.end_min)}</strong>
              <small>{daysMaskToLabels(s.days_mask)}</small>
            </div>
            <div className="spacer" />
            <button className="btn danger" onClick={() => { void (async () => { await api.deleteSchedule(s.id); await reload(); })(); }}>Remove</button>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 12 }}>
        <div className="row">
          <select value={kind} onChange={(e) => setKind(e.target.value as "quiet" | "active")} style={{ width: "auto" }}>
            <option value="quiet">Quiet (never call)</option>
            <option value="active">Active (only call)</option>
          </select>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} style={{ width: "auto" }} />
          <span className="muted">to</span>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={{ width: "auto" }} />
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          {DAY_LABELS.map((d, i) => (
            <button key={d} className={"btn" + ((days & (1 << i)) ? " primary" : "")} onClick={() => toggleDay(i)} style={{ padding: "6px 10px" }}>{d}</button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary" disabled={add.pending} onClick={() => add.run(async () => {
            const s = hhmmToMinutes(start); const e = hhmmToMinutes(end);
            if (s === null || e === null) throw new Error("Enter valid times");
            await api.addSchedule(kind, days, s, e);
            await reload();
          })}>Add rule</button>
          {add.error && <span className="err">{add.error}</span>}
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          Quiet windows always win. If any Active window exists, calls happen only inside one. Times are in your timezone.
          Overnight windows (e.g. 22:00–07:00) are supported.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connect Teams (ingest token + Power Automate condition)
// ---------------------------------------------------------------------------
export function TeamsConnect() {
  const [condition, setCondition] = useState("");
  const [ingestUrl, setIngestUrl] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const regen = useAction();

  async function reload() {
    const r = await api.flowCondition();
    setCondition(r.condition);
    setIngestUrl(r.ingestUrl);
    setBodyTemplate(r.bodyTemplate);
  }
  useEffect(() => { void reload(); }, []);

  return (
    <div>
      <p className="muted">
        Build a Power Automate flow in your own Microsoft account. It forwards only <strong>who</strong> pinged
        you and whether it was a DM or @mention — never the message text.
      </p>

      <h3 style={{ marginBottom: 4 }}>1. Your webhook secret</h3>
      <p className="muted" style={{ fontSize: 13 }}>
        Generate a token and put it in the flow's HTTP header <code>X-Ping-Token</code>. It's shown once — save it now.
      </p>
      <div className="row">
        <button className="btn primary" disabled={regen.pending} onClick={() => regen.run(async () => {
          const r = await api.regenIngestToken();
          setToken(r.token);
          setIngestUrl(r.ingestUrl);
        })}>{regen.pending ? "Generating…" : token ? "Regenerate token" : "Generate token"}</button>
        {regen.error && <span className="err">{regen.error}</span>}
      </div>
      {token && <CodeBlock text={token} />}

      <h3 style={{ marginBottom: 4 }}>2. HTTP action URL &amp; headers</h3>
      <CodeBlock text={`POST ${ingestUrl}\nContent-Type: application/json\nX-Ping-Token: <the token above>`} />

      <h3 style={{ marginBottom: 4 }}>3. HTTP action body (metadata only)</h3>
      <CodeBlock text={bodyTemplate} />

      <h3 style={{ marginBottom: 4 }}>4. Condition (forward only your senders)</h3>
      <p className="muted" style={{ fontSize: 13 }}>
        Paste into the flow's Condition in expression mode. Update it whenever you add or remove a sender.
      </p>
      <CodeBlock text={condition} />
      <button className="btn" onClick={() => void reload()}>Refresh condition</button>
    </div>
  );
}
