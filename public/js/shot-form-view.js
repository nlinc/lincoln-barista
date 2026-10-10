const measurementFields = ['grind', 'time', 'dose', 'yield'];

export const readShotMeasurements = () => Object.fromEntries(measurementFields.map(field =>
    [field, document.getElementById(`input-shot-${field}`).value.trim()]));

export const renderShotFieldErrors = (fieldErrors = {}, focus = false) => {
    for (const field of measurementFields) {
        const input = document.getElementById(`input-shot-${field}`);
        const error = document.getElementById(`shot-${field}-error`);
        const message = fieldErrors[field] || '';
        error.textContent = message;
        error.hidden = !message;
        if (message) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
    }
    if (focus) {
        const field = measurementFields.find(field => fieldErrors[field]);
        if (field) document.getElementById(`input-shot-${field}`).focus();
    }
};

export const renderShotSaveError = (message = '') => {
    const error = document.getElementById('shot-save-error');
    error.textContent = message;
    error.hidden = !message;
};
