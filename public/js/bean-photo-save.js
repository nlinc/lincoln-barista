export const saveBeanPhotoChange = async ({ previousPath, nextPath, save, removePhoto }) => {
    const result = await save();
    if (previousPath && previousPath !== nextPath) {
        try {
            await removePhoto(previousPath);
        } catch (error) {
            // A cleanup failure must not turn a saved bean into a failed save.
            console.warn('Previous bean photo cleanup skipped:', error);
        }
    }
    return result;
};
