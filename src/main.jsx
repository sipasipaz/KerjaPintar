import React from "react";
import ReactDOM from "react-dom/client";
import AuthGate from "./AuthGate.jsx";
import "./index.css";

// AuthGate handles Google sign-in via Firebase, wires window.storage to
// the Firestore-backed implementation once signed in, then renders <App/>.
// See src/lib/storage.js if you ever want to go back to local-only mode.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthGate />
  </React.StrictMode>
);
