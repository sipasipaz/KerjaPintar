import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "./firebaseClient.js";

// Same four-method shape the app already expects from `window.storage`.
// Each signed-in user's data lives under users/{uid}/kv/{docId} — see
// firestore.rules, which makes sure a user can only ever read/write their
// own subtree.
function docIdFor(key, shared) {
  return `${shared ? "shared" : "local"}__${key}`;
}

export const firestoreStorage = {
  async get(key, shared = false) {
    const user = auth.currentUser;
    if (!user) return null;
    try {
      const ref = doc(db, "users", user.uid, "kv", docIdFor(key, shared));
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      return { key, value: snap.data().value, shared };
    } catch (e) {
      console.error("firestoreStorage.get failed:", e.message);
      return null;
    }
  },

  async set(key, value, shared = false) {
    const user = auth.currentUser;
    if (!user) return null;
    try {
      const ref = doc(db, "users", user.uid, "kv", docIdFor(key, shared));
      await setDoc(ref, { key, shared, value, updatedAt: Date.now() });
      return { key, value, shared };
    } catch (e) {
      console.error("firestoreStorage.set failed:", e.message);
      return null;
    }
  },

  async delete(key, shared = false) {
    const user = auth.currentUser;
    if (!user) return null;
    try {
      const ref = doc(db, "users", user.uid, "kv", docIdFor(key, shared));
      const snap = await getDoc(ref);
      const existed = snap.exists();
      if (existed) await deleteDoc(ref);
      return { key, deleted: existed, shared };
    } catch (e) {
      console.error("firestoreStorage.delete failed:", e.message);
      return null;
    }
  },

  async list(prefix = "", shared = false) {
    const user = auth.currentUser;
    if (!user) return null;
    try {
      const colRef = collection(db, "users", user.uid, "kv");
      const q = query(colRef, where("shared", "==", shared));
      const snaps = await getDocs(q);
      const keys = [];
      snaps.forEach(s => {
        const k = s.data().key;
        if (typeof k === "string" && k.startsWith(prefix)) keys.push(k);
      });
      return { keys, prefix, shared };
    } catch (e) {
      console.error("firestoreStorage.list failed:", e.message);
      return null;
    }
  },
};
