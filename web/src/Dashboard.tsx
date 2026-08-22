import { useEffect, useState } from "react";
import { api, type CallLogRow, type Me, type Settings } from "./api";
import { Card, Toggle, useAction } from "./ui";
import { ScheduleEditor, SendersEditor, TeamsConnect } from "./components";
import { decisionLabel, formatTs } from "./helpers";

export default function Dashboard(props: { me: Me; refresh: () => Promise<void>; onOpenWizard: () => void; onSignedOut: () => void }) {
  const { me } = props;
  const [settings, setSettings] = useState<Settings | null>(null);
  const [calls, setCalls] = useState<CallLogRow[]>([]);
  const [showTeams, setShowTeams] = useState(false);
  const [minGap, setMinGap] = useState("120");
  const del = useAction();

  async function loadSettings() {
    const r = await api.getSettings();
    setSettings(r.settings);
    setMinGap(String(r.settings.min_seconds_between_calls));
  }
  async function loadCalls() { setCalls((await api.callLog()).calls); }
  useEffect(() => { void loadSettings(); void loadCalls(); }, []);

  const muted = settings?.master_mute === 1;

  return (
    <div className="wrap">
      <div className="topbar">
        <div className="brand"><span className="dot">📞</span> Ping-to-Call</div>
        <div className="row">
          <span className="muted" style={{ fontSize: 13 }}>{me.user.email || me.user.displayName}</span>
          <button className="btn" onClick={() => { void api.logout().then(props.onSignedOut); }}>Sign out</button>
        </div>
      </div>

      <Card>
        <div className="row">
          <div className="who">
            <h2 style={{ margin: 0 }}>{muted ? "Alerts are muted" : "Alerts are on"}</h2>
            <span className="muted">{muted ? "You won't get calls until you switch this back on." : "You'll be called when a listed sender pings you."}</span>
          </div>
          <div className="spacer" />
          <Toggle
            checked={!muted}
            onChange={(on) => { void (async () => { await api.updateSettings({ masterMute: !on }); await loadSettings(); })(); }}
            label={muted ? "Off" : "On"}
          />
        </div>
      </Card>

      {(!me.setup.hasPhone || !me.setup.hasTwilio || me.setup.senderCount === 0 || !me.setup.hasIngestToken) && (
        <Card title="Finish setup" sub="A few steps are still incomplete.">
          <button className="btn primary" onClick={props.onOpenWizard}>Open setup wizard</button>
        </Card>
      )}

      <Card title="Senders" sub="People whose Teams pings call you. Toggle any on or off instantly.">
        <SendersEditor onChange={() => void props.refresh()} />
      </Card>

      <Card title="Quiet & active hours" sub="Only be called when you want. Evaluated in your timezone.">
        <ScheduleEditor />
      </Card>

      <Card title="Settings">
        <label className="field">
          <span>Minimum seconds between calls (avoids a call storm)</span>
          <div className="row">
            <input type="number" value={minGap} min={0} onChange={(e) => setMinGap(e.target.value)} style={{ maxWidth: 140 }} />
            <button className="btn" onClick={() => { void (async () => { await api.updateSettings({ minSecondsBetweenCalls: parseInt(minGap, 10) || 0 }); await loadSettings(); })(); }}>Save</button>
          </div>
        </label>
      </Card>

      <Card title="Connect Teams" sub="Your Power Automate flow + webhook. Re-open to update the condition after changing senders.">
        {showTeams ? <TeamsConnect /> : <button className="btn" onClick={() => setShowTeams(true)}>Show flow setup</button>}
      </Card>

      <Card title="Recent activity" sub="Metadata only — never message content.">
        <button className="btn" onClick={() => void loadCalls()} style={{ marginBottom: 8 }}>Refresh</button>
        <ul className="list">
          {calls.length === 0 && <li className="muted">No activity yet.</li>}
          {calls.map((c) => {
            const d = decisionLabel(c.decision);
            return (
              <li key={c.id}>
                <div className="who">
                  <strong>{c.sender || "(unknown)"} {c.is_mention ? "· mention" : "· DM"}</strong>
                  <small className="muted">{formatTs(c.created_at)}</small>
                </div>
                <div className="spacer" />
                <span className={"pill " + d.cls}>{d.text}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Danger zone">
        <p className="muted" style={{ fontSize: 13 }}>Deletes your account, senders, schedules, and stored Twilio credentials. This cannot be undone.</p>
        <button className="btn danger" disabled={del.pending} onClick={() => del.run(async () => {
          if (!confirm("Delete your account and all data? This cannot be undone.")) return;
          await api.deleteAccount();
          props.onSignedOut();
        })}>Delete my account</button>
        {del.error && <p className="err">{del.error}</p>}
      </Card>
    </div>
  );
}
