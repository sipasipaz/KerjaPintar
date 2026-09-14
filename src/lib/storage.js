// localStorage-backed implementation of the storage interface.
//
// Not used by default anymore — main.jsx now uses AuthGate, which wires
// window.storage to src/lib/supabaseStorage.js after Google sign-in, so
// data syncs across devices. This file is kept around in case you ever
// want a no-login / offline-only mode: point main.jsx at it directly
// instead of AuthGate and it works exactly as before.

const NAMESPACE = "ppos";

function storageKey(key, shared) {
  return `${NAMESPACE}:${shared ? "shared" : "local"}:${key}`;
}

export const storage = {
  async get(key, shared = false) {
    try {
      const k = storageKey(key, shared);
      const value = window.localStorage.getItem(k);
      if (value === null) return null;
      return { key, value, shared };
    } catch (e) {
      return null;
    }
  },

  async set(key, value, shared = false) {
    try {
      const k = storageKey(key, shared);
      window.localStorage.setItem(k, value);
      return { key, value, shared };
    } catch (e) {
      return null;
    }
  },

  async delete(key, shared = false) {
    try {
      const k = storageKey(key, shared);
      const existed = window.localStorage.getItem(k) !== null;
      window.localStorage.removeItem(k);
      return { key, deleted: existed, shared };
    } catch (e) {
      return null;
    }
  },

  async list(prefix = "", shared = false) {
    try {
      const fullPrefix = storageKey(prefix, shared);
      const keys = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(fullPrefix)) {
          keys.push(k.slice(`${NAMESPACE}:${shared ? "shared" : "local"}:`.length));
        }
      }
      return { keys, prefix, shared };
    } catch (e) {
      return null;
    }
  },
};
