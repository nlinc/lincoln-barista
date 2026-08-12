import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase-client.js?v=1.9.4";

export const fetchUserProfile = async (uid) => {
    const snapshot = await getDoc(doc(db, "user_profiles", uid));
    return snapshot.exists() ? snapshot.data() : null;
};

export const saveUserProfile = (uid, profile) => setDoc(doc(db, "user_profiles", uid), profile);
