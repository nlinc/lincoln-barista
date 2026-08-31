import { collection, deleteField, doc, getDocs, query, setDoc, updateDoc, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { deleteObject, getDownloadURL, ref as storageRef, uploadString } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { db, storage } from "./firebase-client.js?v=1.10.0";

export const fetchBeansForUser = async (uid) => {
    const snapshot = await getDocs(query(collection(db, "beans"), where("uid", "==", uid)));
    return snapshot.docs.map(beanDoc => ({ id: beanDoc.id, ...beanDoc.data() }));
};

export const createBeanId = () => doc(collection(db, "beans")).id;

export const createBean = (beanId, data) => setDoc(doc(db, "beans", beanId), data);

export const updateBean = (beanId, data) => updateDoc(doc(db, "beans", beanId), data.impression !== undefined
    ? { ...data, rating: deleteField() }
    : data);

export const archiveBean = (beanId) => updateBean(beanId, {
    archived: true,
    archivedAt: new Date(),
    updatedAt: new Date()
});

export const uploadBeanPhoto = async (uid, beanId, dataUrl) => {
    const path = `users/${uid}/beans/${beanId}/bag-${Date.now()}.jpg`;
    const ref = storageRef(storage, path);
    await uploadString(ref, dataUrl, "data_url", {
        contentType: "image/jpeg",
        customMetadata: { uid, beanId }
    });
    return { image: null, imageUrl: await getDownloadURL(ref), imagePath: path };
};

export const deleteBeanPhoto = async (path) => {
    if (!path) return;
    try {
        await deleteObject(storageRef(storage, path));
    } catch (error) {
        console.warn("Storage cleanup skipped:", error);
    }
};
