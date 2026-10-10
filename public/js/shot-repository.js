import { addDoc, collection, deleteDoc, deleteField, doc, getDocs, query, runTransaction, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase-client.js?v=1.17.0";
import { shotNormalizationPatch } from "./shot-record.js?v=1.17.0";

export const fetchShotsForUser = async (uid) => {
    const snapshot = await getDocs(query(collection(db, "brew_logs"), where("uid", "==", uid)));
    return snapshot.docs.map(shotDoc => ({ id: shotDoc.id, ...shotDoc.data() }));
};

export const createShot = async (data) => {
    const created = await addDoc(collection(db, "brew_logs"), data);
    return created.id;
};

export const updateShot = (shotId, data) => runTransaction(db, async transaction => {
    const reference = doc(db, "brew_logs", shotId);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error("This shot is no longer available.");
    const cleanup = shotNormalizationPatch(snapshot.data());
    const patch = { ...cleanup.fields, ...data };
    cleanup.remove.forEach(field => { patch[field] = deleteField(); });
    transaction.update(reference, patch);
});

export const deleteShot = (shotId) => deleteDoc(doc(db, "brew_logs", shotId));
