import { el } from "./dom.js?v=1.17.0";
import { basketFor, normalizeBrewSetup, profilesFor } from "./brew-setup.js?v=1.17.0";
import { STARTING_BASKETS } from "./starting-point.js?v=1.17.0";
import { convertTemperature } from "./elizabeth-tuning.js?v=1.17.0";

export const renderShotBaskets = (machineId, ownedIds, selectedId = '') => {
    const picker = document.getElementById('input-shot-basket');
    const unknown = el('option', '', 'Not recorded');
    unknown.value = '';
    picker.replaceChildren(unknown);
    STARTING_BASKETS.filter(basket => (!basket.machineId || basket.machineId === machineId) && (ownedIds.includes(basket.id) || basket.id === selectedId)).forEach(basket => {
        const option = el('option', '', basket.name);
        option.value = basket.id;
        picker.append(option);
    });
    picker.value = selectedId;
};

export const renderBagSetup = ({ bean, machineId, machine, ownedIds, saved, recipe, defaultDose }) => {
    const details = document.getElementById('bag-setup-editor');
    details.hidden = bean.archived === true;
    details.open = false;
    details.querySelector('summary').textContent = saved ? 'Edit saved setup' : 'Set up this bag';
    document.getElementById('bag-setup-status').textContent = '';
    const picker = document.getElementById('bag-setup-basket');
    const blank = el('option', '', 'Choose your basket');
    blank.value = '';
    picker.replaceChildren(blank);
    STARTING_BASKETS.filter(basket => (!basket.machineId || basket.machineId === machineId) && (ownedIds.includes(basket.id) || saved?.basketId === basket.id)).forEach(basket => {
        const option = el('option', '', basket.name);
        option.value = basket.id;
        picker.append(option);
    });
    picker.value = saved?.basketId || '';
    const source = saved || recipe || {};
    document.getElementById('bag-setup-dose').value = source.dose || defaultDose;
    document.getElementById('bag-setup-ratio').value = saved?.ratio || (Math.round(Number(recipe?.yield) / Number(recipe?.dose) * 100) / 100) || 2;
    document.getElementById('bag-setup-grind').value = source.grind || '';
    document.getElementById('bag-setup-tamp').value = saved ? saved.tampForceLb ?? '' : 25;
    document.getElementById('bag-setup-temperature').value = source.brewTemperature
        ? convertTemperature(source.brewTemperature, source.temperatureUnit || machine.temperatureUnit, machine.temperatureUnit) : machine.brewTemperature || '';
    const temp = document.getElementById('bag-setup-temperature');
    temp.min = machine.temperatureUnit === 'C' ? 80 : 175;
    temp.max = machine.temperatureUnit === 'C' ? 110 : 230;
    const profile = document.getElementById('bag-setup-profile');
    profile.replaceChildren(...profilesFor(machineId).map(id => {
        const option = el('option', '', id === 'manual' ? 'Manual' : id.startsWith('bianca-') ? id.replace('bianca-', 'Bianca · ').replaceAll('-', ' ') : id.toUpperCase());
        option.value = id;
        return option;
    }));
    profile.value = profilesFor(machineId).includes(source.profileUsed) ? source.profileUsed : 'manual';
    document.getElementById('recipe-setup-context').textContent = saved
        ? `${basketFor(saved.basketId, machineId).name} · 1:${saved.ratio}${saved.tampForceLb ? ` · ${saved.tampForceLb} lb tamper` : ''}`
        : 'Choose a basket and settle on a dose for this bag. Check dry clearance with your usual puck screen.';
};

export const readBagSetup = (machineId, temperatureUnit) => normalizeBrewSetup({
    basketId: document.getElementById('bag-setup-basket').value,
    dose: document.getElementById('bag-setup-dose').value,
    ratio: document.getElementById('bag-setup-ratio').value,
    grind: document.getElementById('bag-setup-grind').value,
    brewTemperature: document.getElementById('bag-setup-temperature').value,
    temperatureUnit,
    profileUsed: document.getElementById('bag-setup-profile').value,
    tampForceLb: document.getElementById('bag-setup-tamp').value
}, machineId);
