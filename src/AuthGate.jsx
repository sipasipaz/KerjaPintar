import { useEffect, useState } from "react";
import {
  GoogleAuthProvider, browserLocalPersistence, getRedirectResult,
  onAuthStateChanged, setPersistence, signInWithRedirect, signOut,
} from "firebase/auth";
import { auth } from "./lib/firebaseClient.js";
import { firestoreStorage } from "./lib/firestoreStorage.js";
import App from "./App.jsx";

export default function AuthGate() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const [status, setStatus] = useState("Starting up…");
  const [log, setLog] = useState([]);

  function addLog(msg) {
    const line = `${new Date().toLocaleTimeString()} — ${msg}`;
    console.log("[auth]", msg);
    setLog(l => [...l, line]);
  }

  useEffect(() => {
    let unsub = () => {};
    (async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
        addLog("Persistence set (browserLocalPersistence).");
      } catch (e) {
        addLog(`setPersistence failed: ${e.code || e.message}`);
      }

      setStatus("Checking for a completed sign-in…");
      try {
        const result = await getRedirectResult(auth);
        addLog(result?.user
          ? `Redirect result: signed in as ${result.user.email}`
          : "Redirect result: nothing pending (normal on first load).");
      } catch (e) {
        addLog(`getRedirectResult error: ${e.code || "unknown"} — ${e.message}`);
      }

      unsub = onAuthStateChanged(auth, (u) => {
        addLog(u ? `Auth state: signed in as ${u.email}` : "Auth state: signed out");
        setUser(u);
        setStatus(u ? "Signed in." : "Not signed in.");
      });
    })();
    return () => unsub();
  }, []);

  async function signInWithGoogle() {
    addLog("Starting Google redirect sign-in…");
    setStatus("Redirecting to Google…");
    try {
      await signInWithRedirect(auth, new GoogleAuthProvider());
      // Page navigates away here — nothing after this line runs.
    } catch (e) {
      addLog(`signInWithRedirect error: ${e.code || "unknown"} — ${e.message}`);
    }
  }

  async function handleSignOut() {
    await signOut(auth);
  }

  if (user) {
    if (!window.storage || window.__ppos_storage_backend !== "firebase") {
      window.storage = firestoreStorage;
      window.__ppos_storage_backend = "firebase";
    }
    return <App onSignOut={handleSignOut} userEmail={user.email} />;
  }

  return (
    <div style={screenStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 6, color: "#1f2023" }}>Personal Project OS</div>
        <div style={{ fontSize: 13, color: "#6c6e75", marginBottom: 22 }}>
          {user === undefined ? status : "Sign in with Google to sync your projects and tasks across devices."}
        </div>
        {user !== undefined && (
          <button onClick={signInWithGoogle} style={buttonStyle}>
            <GoogleIcon />
            Continue with Google
          </button>
        )}

        <details style={{ marginTop: 20, textAlign: "left" }}>
          <summary style={{ fontSize: 12, color: "#9a9a9a", cursor: "pointer" }}>Debug log ({log.length})</summary>
          <pre style={{
            fontSize: 11, lineHeight: 1.5, color: "#4a4a4a", background: "#F2F3F5",
            padding: 10, borderRadius: 6, marginTop: 8, maxHeight: 220, overflow: "auto",
            whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            {log.length ? log.join("\n") : "Nothing logged yet."}
          </pre>
          <button
            onClick={() => navigator.clipboard.writeText(log.join("\n"))}
            style={{ ...buttonStyle, marginTop: 8, fontSize: 12, padding: "6px 12px" }}
          >
            Copy debug log
          </button>
        </details>
      </div>
    </div>
  );
}

const screenStyle = {
  width: "100%",
  height: "100%",
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#F2F3F5",
};

const cardStyle = {
  width: 380,
  padding: "32px 28px",
  borderRadius: 12,
  background: "#FFFFFF",
  border: "1px solid #E1E2E6",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
  textAlign: "center",
};

const buttonStyle = {
  width: "100%",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  padding: "10px 16px",
  borderRadius: 8,
  border: "1px solid #E1E2E6",
  background: "#FFFFFF",
  fontSize: 14,
  fontWeight: 500,
  color: "#1f2023",
  cursor: "pointer",
};

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.3 1 7.3 2.7l6-6C33.7 6.5 29.1 4.5 24 4.5 13.5 4.5 5 13 5 23.5S13.5 42.5 24 42.5c9.9 0 18.4-7.2 19.6-16.6.1-.8.1-1.6.1-2.4 0-1-.1-1.9-.1-3z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c2.8 0 5.3 1 7.3 2.7l6-6C33.7 6.5 29.1 4.5 24 4.5c-7.5 0-14 4.2-17.7 10.2z" />
      <path fill="#4CAF50" d="M24 42.5c5 0 9.6-1.9 13-5.1l-6-4.9c-2 1.4-4.5 2.3-7 2.3-5.3 0-9.7-2.6-11.3-7l-6.5 5C9.9 38.3 16.4 42.5 24 42.5z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.3 4.1-4.3 5.5l6 4.9c-.4.4 6.9-5 6.9-15.4 0-1-.1-1.9-.3-3z" />
    </svg>
  );
}
