import { useMemo, useState } from "react";
import type { Me } from "./api";
import { Card } from "./ui";
import { PhoneForm, SendersEditor, TeamsConnect, TwilioForm } from "./components";

export default function Wizard(props: { me: Me; refresh: () => Promise<void>; onFinish: () => void }) {
  const { me, refresh } = props;

  // Start on the first incomplete step.
  const firstIncomplete = useMemo(() => {
    if (!me.setup.hasPhone) return 0;
    if (!me.setup.hasTwilio) return 1;
    if (me.setup.senderCount === 0) return 3;
    if (!me.setup.hasIngestToken) return 4;
    return 0;
  }, [me]);
  const [step, setStep] = useState(firstIncomplete);

  const steps = ["Phone", "Twilio", "iPhone", "Senders", "Teams"];
  const canTest = me.setup.hasPhone && me.setup.hasTwilio;

  function Progress() {
    return (
      <div className="steps">
        {steps.map((_, i) => (
          <div key={i} className={"step " + (i < step ? "done" : i === step ? "current" : "")} />
        ))}
      </div>
    );
  }

  function Nav(props2: { nextLabel?: string; nextDisabled?: boolean; onNext?: () => void }) {
    return (
      <div className="row" style={{ marginTop: 16 }}>
        {step > 0 && <button className="btn" onClick={() => setStep((s) => s - 1)}>Back</button>}
        <div className="spacer" />
        <button
          className="btn primary"
          disabled={props2.nextDisabled}
          onClick={props2.onNext || (() => setStep((s) => s + 1))}
        >
          {props2.nextLabel || "Next"}
        </button>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="topbar">
        <div className="brand"><span className="dot">📞</span> Setup</div>
        <button className="btn" onClick={props.onFinish}>Skip to dashboard</button>
      </div>
      <Progress />

      {step === 0 && (
        <Card title="Step 1 — Your phone" sub="Where should we call you, and what timezone are you in?">
          <PhoneForm initialPhone={me.user.phone} initialTz={me.user.timezone} onSaved={() => void refresh()} />
          <Nav nextDisabled={!me.setup.hasPhone} />
        </Card>
      )}

      {step === 1 && (
        <Card title="Step 2 — Your Twilio account" sub="You bring your own Twilio number so calls are billed to you. Save, then send a test call.">
          <TwilioForm canTest={canTest} onSaved={() => void refresh()} />
          <Nav nextDisabled={!me.setup.hasTwilio} />
        </Card>
      )}

      {step === 2 && (
        <Card title="Step 3 — Make it ring through Do Not Disturb" sub="This is an iPhone setting on the number that calls you.">
          <ol style={{ paddingLeft: 18 }}>
            <li>Save your <strong>Twilio number</strong> as a contact (e.g. “Teams Boss Alert”).</li>
            <li>Open the contact → <strong>Edit</strong> → <strong>Ringtone</strong> → turn on <strong>Emergency Bypass</strong>.</li>
            <li>This lets the call ring through any Focus / Do Not Disturb and the silent switch.</li>
            <li>Optional: in each Focus (e.g. Sleep), add this contact under <em>Allow Notifications From</em>.</li>
          </ol>
          <p className="muted">Test it: turn on Do Not Disturb, then use “Send test call” on the previous step — it should still ring.</p>
          <Nav />
        </Card>
      )}

      {step === 3 && (
        <Card title="Step 4 — Who should reach you?" sub="Add the people whose Teams pings should trigger a call.">
          <SendersEditor onChange={() => void refresh()} />
          <Nav nextDisabled={me.setup.senderCount === 0} />
        </Card>
      )}

      {step === 4 && (
        <Card title="Step 5 — Connect Teams" sub="Build a Power Automate flow that forwards pings from your senders — metadata only.">
          <TeamsConnect />
          <Nav nextLabel="Finish" onNext={() => { void refresh().then(props.onFinish); }} />
        </Card>
      )}
    </div>
  );
}
