import { el } from "./dom.js?v=1.17.0";
import { STARTING_BASKETS, normalizeStartingSetup } from "./starting-point.js?v=1.17.0";

export const renderStartingBeans = (beans, selectedId) => {
    const picker = document.getElementById("starting-bean");
    picker.replaceChildren();
    beans.filter(bean => !bean.archived).forEach(bean => {
        const option = el("option", "", [bean.roaster, bean.name].filter(Boolean).join(" · "));
        option.value = bean.id;
        picker.appendChild(option);
    });
    if ([...picker.options].some(option => option.value === selectedId)) picker.value = selectedId;
    picker.disabled = picker.options.length === 0;
};

export const renderStartingSetup = (value, machineId) => {
    const setup = normalizeStartingSetup(value, machineId);
    for (const [key, field] of Object.entries({ grinderName: "grinder", baselineGrind: "grind", doseMin: "dose-min", doseMax: "dose-max", headspace: "headspace", ratio: "ratio", referenceVolume: "reference-volume" })) {
        document.getElementById(`starting-${field}`).value = setup[key] ?? "";
    }
    const container = document.getElementById("starting-owned-baskets");
    container.replaceChildren();
    const calibrationDetails = el("details", "starting-calibration secondary-disclosure");
    calibrationDetails.appendChild(el("summary", "", "Basket calibration (advanced)"));
    STARTING_BASKETS.filter(basket => !basket.machineId || basket.machineId === machineId).forEach(basket => {
        const label = el("label", "starting-basket-label");
        const checkbox = el("input");
        checkbox.type = "checkbox";
        checkbox.checked = setup.ownedBasketIds.includes(basket.id);
        checkbox.dataset.ownedBasket = basket.id;
        label.append(checkbox, document.createTextNode(basket.name));
        container.appendChild(label);
        const row = el("div", "starting-basket-row");
        row.dataset.basketId = basket.id;
        const details = el("details", "starting-calibration");
        details.appendChild(el("summary", "", basket.name));
        const grid = el("div", "form-grid three-col");
        for (const [field, title, min, max] of [["referenceDose", "Reference dose (g)", 5, 30], ["puckDepth", "Tamped puck depth (mm)", 1, 35], ["clearance", "Floor to screen (mm)", 1, 40]]) {
            const group = el("div", "form-group");
            const input = el("input");
            input.id = `starting-calibration-${basket.id}-${field}`;
            input.type = "number";
            input.inputMode = "decimal";
            input.min = min;
            input.max = max;
            input.step = "0.1";
            input.dataset.calibration = field;
            input.value = setup.calibrations[basket.id]?.[field] ?? "";
            const fieldLabel = el("label", "", title);
            fieldLabel.htmlFor = input.id;
            group.append(fieldLabel, input);
            grid.appendChild(group);
        }
        details.append(grid, el("p", "subtle-note", "Measure with the baseline coffee whose 18g Falcon volume you entered above. Floor-to-screen clearance must account for the shower screw and any puck screen. Recalibrate when those change."));
        row.appendChild(details);
        calibrationDetails.appendChild(row);
    });
    container.appendChild(calibrationDetails);
};

export const readStartingSetup = (machineId) => {
    const value = { ownedBasketIds: [], calibrations: {} };
    for (const [key, field] of Object.entries({ grinderName: "grinder", baselineGrind: "grind", doseMin: "dose-min", doseMax: "dose-max", headspace: "headspace", ratio: "ratio", referenceVolume: "reference-volume" })) value[key] = document.getElementById(`starting-${field}`).value;
    document.querySelectorAll("[data-owned-basket]:checked").forEach(input => value.ownedBasketIds.push(input.dataset.ownedBasket));
    let error = null;
    document.querySelectorAll("[data-basket-id]").forEach(row => {
        const calibration = {};
        row.querySelectorAll("[data-calibration]").forEach(input => { calibration[input.dataset.calibration] = input.value; });
        if (Object.values(calibration).some(Boolean)) {
            if (!Object.values(calibration).every(Boolean) || Number(calibration.clearance) <= Number(calibration.puckDepth)) error = "Complete all three calibration fields, with floor-to-screen distance greater than puck depth, or clear all three.";
            else value.calibrations[row.dataset.basketId] = calibration;
        }
    });
    if (Number(value.doseMin) > Number(value.doseMax)) error = "Minimum dose must not exceed maximum dose.";
    if (!value.ownedBasketIds.length) error = "Select at least one basket you own.";
    return { setup: normalizeStartingSetup(value, machineId), error };
};

export const renderStartingBasketOptions = (setup, machineId) => {
    const picker = document.getElementById("starting-basket");
    const previous = picker.value;
    const auto = el("option", "", "Auto · choose from my baskets");
    auto.value = "auto";
    picker.replaceChildren(auto);
    STARTING_BASKETS.filter(basket => (!basket.machineId || basket.machineId === machineId) && setup.ownedBasketIds.includes(basket.id)).forEach(basket => {
        const option = el("option", "", basket.name);
        option.value = basket.id;
        picker.appendChild(option);
    });
    picker.value = [...picker.options].some(option => option.value === previous) ? previous : "auto";
};

export const renderStartingResult = (plan, hasBean) => {
    const target = document.getElementById("starting-result");
    const logButton = document.getElementById("starting-log-shot");
    logButton.disabled = !hasBean || !!plan.error || !plan.canLog;
    if (plan.error) {
        target.replaceChildren(el("p", "status-strip status-warning", plan.error));
        return;
    }
    const card = el("div", "card starting-result-card");
    card.append(el("div", "field-kicker", "First-shot targets"), el("h2", "section-title", `Use ${plan.basket.name}`));
    const metrics = el("dl", "starting-metrics");
    for (const [label, value] of [
        ["Starting dose", `${plan.dose.toFixed(1)}g`],
        ["Starting yield", `${plan.yield.toFixed(1)}g · 1:${plan.ratio}`],
        ["Temperature", `${plan.temperature}°${plan.temperatureUnit}`],
        ["Target time", plan.time],
        ["Grind starting point", plan.grind],
        ["Pre-infusion", plan.preinfusion]
    ]) {
        const item = el("div");
        item.append(el("dt", "", label), el("dd", "", value));
        metrics.appendChild(item);
    }
    const explanation = el("details", "secondary-disclosure");
    explanation.append(el("summary", "", "Recipe assumptions & headspace"), el("p", "subtle-note", plan.headspace === null ? "A numeric headspace estimate needs basket calibration." : `Estimated headspace: ≈ ${plan.headspace.toFixed(1)} mm · proxy, verify physically.`));
    plan.reasons.forEach(reason => explanation.appendChild(el("p", "", reason)));
    plan.notes.forEach(note => explanation.appendChild(el("p", "subtle-note", note)));
    card.append(metrics, explanation);
    if (!plan.canLog) card.appendChild(el("p", "status-strip status-warning", "Estimated puck contact: reduce dose or choose a larger basket before brewing."));
    if (!hasBean) card.appendChild(el("p", "subtle-note", "Add an active bean to log this starting point."));
    target.replaceChildren(card);
};
