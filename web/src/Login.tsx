import { useState } from "react";
import { api } from "./api";
import { Field, useAction } from "./ui";

export default function Login(props: { onAuthed: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const act = useAction();

  const submit = () =>
    act.run(async () => {
      if (mode === "signup") await api.signup(email.trim(), password);
      else await api.login(email.trim(), password);
      props.onAuthed();
    });

  return (
    <div className="wrap">
      <div className="hero">
        <div className="brand center" style={{ justifyContent: "center", marginBottom: 24 }}>
          <span className="dot">📞</span> Ping-to-Call
        </div>
        <h1>Never miss your boss on Teams</h1>
        <p>
          Get a phone call — one that rings through Do Not Disturb and sleep — the moment a
          specific person messages or @mentions you on Microsoft Teams. We never see your
          message content, only who pinged you.
        </p>
      </div>

      <div className="card" style={{ maxWidth: 420, margin: "0 auto" }}>
        <h2>{mode === "signup" ? "Create your account" : "Sign in"}</h2>
        <Field label="Email" type="text" value={email} onChange={setEmail} placeholder="you@example.com" />
        <Field
          label={mode === "signup" ? "Password (at least 8 characters)" : "Password"}
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
        />
        <div className="row">
          <button className="btn primary" disabled={act.pending || !email || !password} onClick={submit}>
            {act.pending ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </div>
        {act.error && <p className="err">{act.error}</p>}
        <p className="muted" style={{ fontSize: 14, marginTop: 12 }}>
          {mode === "signup" ? (
            <>Already have an account?{" "}
              <a href="#" onClick={(e) => { e.preventDefault(); act.setError(null); setMode("login"); }}>Sign in</a></>
          ) : (
            <>New here?{" "}
              <a href="#" onClick={(e) => { e.preventDefault(); act.setError(null); setMode("signup"); }}>Create an account</a></>
          )}
        </p>
      </div>

      <div className="card" style={{ maxWidth: 420, margin: "16px auto 0" }}>
        <h2>How it works</h2>
        <ul className="muted" style={{ paddingLeft: 18, margin: 0 }}>
          <li>Add the people whose pings should reach you.</li>
          <li>A phone call is placed through your own Twilio number.</li>
          <li>Mute anytime you're at your computer, or set quiet/active hours.</li>
          <li>Detection runs in your own Microsoft Power Automate — message text never leaves your org.</li>
        </ul>
      </div>
    </div>
  );
}
