import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase-client.js?v=1.9.4";

export const fetchShotsForUser = async (uid) => {
    const snapshot = await getDocs(query(collection(db, "brew_logs"), where("uid", "==", uid)));
    return snapshot.docs.map(shotDoc => ({ id: shotDoc.id, ...shotDoc.data() }));
};

export const createShot = async (data) => {
    const created = await addDoc(collection(db, "brew_logs"), data);
    return created.id;
};

export const updateShot = (shotId, data) => updateDoc(doc(db, "brew_logs", shotId), data);

export const deleteShot = (shotId) => deleteDoc(doc(db, "brew_logs", shotId));
