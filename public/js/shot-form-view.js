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

export const programmedShotSeconds = (profileUsed, machineId, profile) => {
    if (machineId !== 'elizabeth' || !['p1', 'p2'].includes(profileUsed)) return null;
    const preset = profile?.[profileUsed === 'p1' ? 'b1' : 'b2'];
    if (!preset) return null;
    const phases = ['infusion', 'bloom', 'brew'].map(key => {
        const value = preset[key] ?? 0;
        return typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
    });
    if (phases.some(value => !Number.isFinite(value) || value < 0)) return null;
    const total = phases.reduce((sum, value) => sum + value, 0);
    return Number.isFinite(total) && total > 0 ? total : null;
};

export const clearProgrammedShotTime = () => {
    delete document.getElementById('input-shot-time').dataset.programmedTime;
    const hint = document.getElementById('shot-time-hint');
    hint.textContent = '';
    hint.hidden = true;
};

export const applyProgrammedShotTime = (profileUsed, machineId, profile) => {
    const input = document.getElementById('input-shot-time');
    const previous = input.dataset.programmedTime;
    const total = programmedShotSeconds(profileUsed, machineId, profile);
    if (total === null) {
        if (previous !== undefined && input.value === previous) input.value = '';
        clearProgrammedShotTime();
        return;
    }
    input.value = String(total);
    input.dataset.programmedTime = input.value;
    const hint = document.getElementById('shot-time-hint');
    hint.textContent = `${profileUsed.toUpperCase()} programmed total. Change it if this shot ran differently.`;
    hint.hidden = false;
};
