import { collection, deleteField, doc, getDocs, query, runTransaction, setDoc, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { deleteObject, getDownloadURL, ref as storageRef, uploadString } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { db, storage } from "./firebase-client.js?v=1.16.0";
import { beanNormalizationPatch, normalizeBeanRecord } from "./bean-record.js?v=1.16.0";

export const fetchBeansForUser = async (uid) => {
    const snapshot = await getDocs(query(collection(db, "beans"), where("uid", "==", uid)));
    return snapshot.docs.map(beanDoc => normalizeBeanRecord({ id: beanDoc.id, ...beanDoc.data() }));
};

export const createBeanId = () => doc(collection(db, "beans")).id;

export const createBean = (beanId, data) => setDoc(doc(db, "beans", beanId), normalizeBeanRecord(data));

export const updateBean = (beanId, data) => runTransaction(db, async transaction => {
    const reference = doc(db, "beans", beanId);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error("This bean is no longer available.");
    const cleanup = beanNormalizationPatch(snapshot.data());
    const patch = { ...cleanup.fields, ...data, ...(data.impression !== undefined && cleanup.remove.includes('rating') ? { rating: deleteField() } : {}) };
    cleanup.remove.forEach(field => { patch[field] = deleteField(); });
    transaction.update(reference, patch);
});

export const archiveBean = async (beanId) => {
    const fields = { archived: true, archivedAt: new Date(), updatedAt: new Date() };
    await updateBean(beanId, fields);
    return fields;
};

export const restoreBean = async (beanId) => {
    const fields = { archived: false, updatedAt: new Date() };
    await updateBean(beanId, { ...fields, archivedAt: deleteField() });
    return fields;
};

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
