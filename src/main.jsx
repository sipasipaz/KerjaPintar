import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { storage } from "./lib/storage.js";
import "./index.css";

// The app talks to `window.storage` (the same interface Claude artifacts
// use). Outside Claude, this polyfills it with a localStorage-backed
// implementation so persistence keeps working.
if (!window.storage) {
  window.storage = storage;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
