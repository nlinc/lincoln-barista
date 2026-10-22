import { el } from "./dom.js?v=1.18.2";
import { basketFor, normalizeBrewSetup, profilesFor, setupRecipe } from "./brew-setup.js?v=1.18.2";
import { recipeWithBestGrind } from "./best-shot.js?v=1.18.2";
import { STARTING_BASKETS } from "./starting-point.js?v=1.18.2";
import { convertTemperature } from "./elizabeth-tuning.js?v=1.18.2";

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
    document.getElementById('bag-setup-grind').value = source.grind ?? '';
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

export const grindSuggestionText = suggestion => suggestion
    ? `Try grind ${suggestion.grind} · ${suggestion.count} matching shots ${suggestion.scope === 'bean' ? 'from this bean' : `across ${suggestion.roast} beans`} in the last 90 days (range ${suggestion.min}–${suggestion.max}). Similar dose and ratio; assumes the same grinder. Bean age can shift the setting. Dial by taste.`
    : 'Collect 3 successful shots for this bean, or 5 across at least 2 beans of the same roast, with this basket and a similar dose and ratio. Stock and Pullman history stay separate.';

export const renderGrindSuggestion = (prefix, suggestion, { editing = false, loading = false } = {}) => {
    const note = document.getElementById(`${prefix}-grind-suggestion`);
    const button = document.getElementById(`${prefix}-use-grind`);
    note.hidden = editing;
    note.textContent = loading ? 'Shot history is not available yet.' : grindSuggestionText(suggestion);
    button.hidden = editing || !suggestion;
    button.textContent = suggestion ? `Use grind ${suggestion.grind}` : 'Use suggested grind';
};

export const renderHomeBrewSetup = ({ bean, beans, machineId, logs = [], suggestion, onSelect, onSetup, onLog }) => {
    const panel = document.getElementById('home-shot-setup');
    const restoreFocus = document.activeElement?.id === 'home-setup-bean';
    panel.hidden = !bean;
    panel.replaceChildren();
    if (!bean) return;
    const setup = normalizeBrewSetup(bean.brewSetups?.[machineId], machineId);
    const recipe = recipeWithBestGrind(bean, logs, machineId, setupRecipe(setup));
    panel.append(el('h2', 'home-setup-title', 'Shot setup'));
    if (beans.length > 1) {
        const field = el('div', 'home-setup-picker');
        const label = el('label', '', 'Bean');
        label.htmlFor = 'home-setup-bean';
        const picker = el('select');
        picker.id = 'home-setup-bean';
        picker.append(...beans.map(item => {
            const option = el('option', '', [item.roaster, item.name].filter(Boolean).join(' · '));
            option.value = item.id;
            return option;
        }));
        picker.value = bean.id;
        picker.addEventListener('change', () => onSelect(picker.value));
        field.append(label, picker);
        panel.append(field);
        if (restoreFocus) picker.focus({ preventScroll: true });
    } else panel.append(el('div', 'home-setup-bean-name', [bean.roaster, bean.name].filter(Boolean).join(' · ')));
    panel.append(el('div', 'home-setup-copy', `${bean.roastLevel} roast`));
    if (setup) {
        panel.append(el('div', 'home-setup-copy', `${basketFor(setup.basketId, machineId).name} · ${setup.dose}g → ${Math.round(setup.dose * setup.ratio * 10) / 10}g · 1:${setup.ratio}`));
        panel.append(el('div', 'home-setup-copy', recipe.bestShotId ? `Best shot grind ${recipe.shot.grind}` : setup.grind ? `Saved grind ${setup.grind}`
            : suggestion ? `Suggested grind ${suggestion.grind} · ${suggestion.count} matching shots` : 'Starting grind: collecting matching shots'));
    } else panel.append(el('div', 'home-setup-copy', recipe ? `${recipe.status === 'Best' ? 'Best' : 'Latest'} shot grind ${recipe.shot.grind}` : 'Choose a basket, dose and ratio for this bag.'));
    const actions = el('div', 'home-setup-actions');
    const edit = el('button', 'btn-secondary small-btn', setup ? 'Edit setup' : 'Set up shot');
    edit.type = 'button';
    edit.setAttribute('aria-label', `${setup ? 'Edit setup' : 'Set up shot'}: ${bean.name}`);
    edit.addEventListener('click', () => onSetup(bean.id));
    actions.append(edit);
    if (setup || recipe) {
        const log = el('button', 'btn-secondary small-btn', 'Log shot');
        log.type = 'button';
        log.setAttribute('aria-label', `Log shot: ${bean.name}`);
        log.addEventListener('click', () => onLog(bean.id));
        actions.append(log);
    }
    panel.append(actions);
};
