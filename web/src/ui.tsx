import { useState } from "react";

export function Card(props: { title?: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="card">
      {props.title && <h2>{props.title}</h2>}
      {props.sub && <p className="sub">{props.sub}</p>}
      {props.children}
    </div>
  );
}

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span className="track" />
      {props.label && <span>{props.label}</span>}
    </label>
  );
}

export function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type={props.type || "text"}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}

/** Copy-to-clipboard code block. */
export function CodeBlock(props: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <pre className="code">{props.text}</pre>
      <button
        className="btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(props.text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard may be blocked; user can select manually */
          }
        }}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

/** Runs an async action, tracking pending/error/ok state for a button. */
export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  async function run(fn: () => Promise<void>, okMsg?: string) {
    setPending(true);
    setError(null);
    setOk(null);
    try {
      await fn();
      if (okMsg) setOk(okMsg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }
  return { pending, error, ok, run, setError };
}
