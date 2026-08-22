import { useCallback, useEffect, useState } from "react";
import { ApiError, api, type Me } from "./api";
import Login from "./Login";
import Wizard from "./Wizard";
import Dashboard from "./Dashboard";

type View = "loading" | "login" | "wizard" | "dashboard";

function isIncomplete(me: Me): boolean {
  return (
    !me.setup.hasPhone || !me.setup.hasTwilio || me.setup.senderCount === 0 || !me.setup.hasIngestToken
  );
}

export default function App() {
  const [view, setView] = useState<View>("loading");
  const [me, setMe] = useState<Me | null>(null);

  // Refreshes `me` without changing the view. Sets login on 401.
  const refresh = useCallback(async (): Promise<Me | null> => {
    try {
      const r = await api.me();
      const data: Me = { user: r.user, setup: r.setup };
      setMe(data);
      return data;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setMe(null);
        setView("login");
      }
      return null;
    }
  }, []);

  // Initial routing.
  useEffect(() => {
    void (async () => {
      const data = await refresh();
      if (data) setView(isIncomplete(data) ? "wizard" : "dashboard");
      else setView("login");
    })();
  }, [refresh]);

  if (view === "loading") return <div className="wrap"><p className="muted center">Loading…</p></div>;
  if (view === "login" || !me) return <Login />;

  if (view === "wizard") {
    return <Wizard me={me} refresh={async () => { await refresh(); }} onFinish={() => setView("dashboard")} />;
  }

  return (
    <Dashboard
      me={me}
      refresh={async () => { await refresh(); }}
      onOpenWizard={() => setView("wizard")}
      onSignedOut={() => { setMe(null); setView("login"); }}
    />
  );
}
