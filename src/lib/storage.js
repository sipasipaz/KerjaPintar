// Standalone replacement for Claude's artifact `window.storage` API.
// Same method shapes (get/set/delete/list), backed by the browser's
// localStorage so the app keeps working outside Claude.
//
// If you later add a real backend, swap this module out for one that
// calls your API instead — nothing in the rest of the app needs to change
// as long as it implements the same four async methods.

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
