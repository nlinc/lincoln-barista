import { addDoc, collection, deleteDoc, doc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase-client.js?v=1.10.0";

export const fetchMaintenanceForUser = async (uid) => {
    const snapshot = await getDocs(query(collection(db, "maintenance_records"), where("uid", "==", uid)));
    return snapshot.docs.map(recordDoc => ({ id: recordDoc.id, ...recordDoc.data() }));
};

export const createMaintenanceRecord = async (data) => {
    const created = await addDoc(collection(db, "maintenance_records"), data);
    return created.id;
};

export const deleteMaintenanceRecord = (recordId) => deleteDoc(doc(db, "maintenance_records", recordId));
