import { STARTING_BASKETS } from "./starting-point.js?v=1.17.0";

export const basketFor = (id, machineId) => STARTING_BASKETS.find(basket => basket.id === id && (!basket.machineId || basket.machineId === machineId));

export const profilesFor = machineId => machineId === 'bianca'
    ? ['manual', 'bianca-standard', 'bianca-low-flow', 'bianca-paddle', 'bianca-bloom'] : ['manual', 'p1', 'p2'];

const numberIn = (value, min, max) => {
    if ((typeof value !== 'number' && typeof value !== 'string') || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
};

export const normalizeBrewSetup = (value, machineId) => {
    if (!value || !['F', 'C'].includes(value.temperatureUnit) || !basketFor(value.basketId, machineId)) return null;
    const dose = numberIn(value.dose, 5, 30);
    const ratio = numberIn(value.ratio, 1, 4);
    const grind = String(value.grind ?? '').trim();
    const temperatureUnit = value.temperatureUnit === 'C' ? 'C' : 'F';
    const brewTemperature = numberIn(value.brewTemperature, temperatureUnit === 'C' ? 80 : 175, temperatureUnit === 'C' ? 110 : 230);
    const tampForceLb = numberIn(value.tampForceLb, 5, 100);
    if (dose === null || ratio === null || grind.length > 30 || (grind && !Number.isFinite(Number(grind))) ||
        !profilesFor(machineId).includes(value.profileUsed) ||
        (value.brewTemperature !== '' && value.brewTemperature != null && brewTemperature === null) ||
        (value.tampForceLb !== '' && value.tampForceLb != null && tampForceLb === null)) return null;
    return { basketId: value.basketId, dose, ratio, grind, brewTemperature, temperatureUnit, profileUsed: value.profileUsed, tampForceLb };
};

export const bagBrewSetup = (bean, machineId) => normalizeBrewSetup(bean?.brewSetups?.[machineId], machineId);

export const setupRecipe = setup => setup ? {
    status: 'Saved',
    shot: { ...setup, dose: String(setup.dose), yield: String(Math.round(setup.dose * setup.ratio * 10) / 10), time: '' }
} : null;
