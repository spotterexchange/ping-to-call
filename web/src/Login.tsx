import { api } from "./api";

export default function Login() {
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
        <a className="btn primary" href={api.loginUrl}>
          Sign in with Microsoft
        </a>
      </div>

      <div className="card">
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
