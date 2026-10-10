import { getElizabethBaseline } from "./elizabeth-tuning.js?v=1.16.0";
import { getBiancaBaseline } from "./bianca-tuning.js?v=1.16.0";

export const STARTING_BASKETS = [
    { id: "stock-elizabeth", name: "Elizabeth stock 14–18g", min: 14, max: 18, machineId: "elizabeth" },
    { id: "stock-bianca", name: "Bianca stock 16–18g", min: 16, max: 18, machineId: "bianca" },
    { id: "pullman-15", name: "Pullman 15–17g", min: 15, max: 17 },
    { id: "pullman-17", name: "Pullman 17–19g", min: 17, max: 19 },
    { id: "pullman-19", name: "Pullman 19–22g", min: 19, max: 22 }
];

const numeric = value => value === "" || value === null || value === undefined ? null : Number(value);
const bounded = (value, min, max, fallback) => {
    const number = numeric(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = value => Math.round(value * 10) / 10;

export const normalizeStartingSetup = (value = {}, machineId = "elizabeth") => {
    value = value && typeof value === "object" ? value : {};
    const available = STARTING_BASKETS.filter(basket => !basket.machineId || basket.machineId === machineId);
    const ownedBasketIds = Array.isArray(value.ownedBasketIds)
        ? available.filter(basket => value.ownedBasketIds.includes(basket.id)).map(basket => basket.id)
        : [`stock-${machineId}`];
    const calibrations = {};
    for (const basket of available) {
        const saved = value.calibrations?.[basket.id];
        if (!saved) continue;
        const referenceDose = bounded(saved.referenceDose, 5, 30, null);
        const puckDepth = bounded(saved.puckDepth, 1, 35, null);
        const clearance = bounded(saved.clearance, 1, 40, null);
        if (referenceDose !== null && puckDepth !== null && clearance !== null && clearance > puckDepth) {
            calibrations[basket.id] = { referenceDose, puckDepth, clearance };
        }
    }
    const doseMin = bounded(value.doseMin, 5, 30, 15);
    return {
        grinderName: String(value.grinderName || "").slice(0, 80),
        baselineGrind: String(value.baselineGrind || "").slice(0, 30),
        doseMin,
        doseMax: Math.max(doseMin, bounded(value.doseMax, 5, 30, 19)),
        headspace: bounded(value.headspace, 0.5, 10, 2),
        ratio: bounded(value.ratio, 1, 4, null),
        referenceVolume: bounded(value.referenceVolume, 20, 50, null),
        ownedBasketIds,
        calibrations
    };
};

export const calculateStartingPoint = ({ setup: rawSetup, machineId = "elizabeth", machine = {}, defaultDose = 18, volume = "", roast = "medium", process = "unknown", basketId = "auto" } = {}) => {
    const setup = normalizeStartingSetup(rawSetup, machineId);
    const measuredVolume = bounded(volume, 20, 50, null);
    if (volume !== "" && volume !== null && volume !== undefined && measuredVolume === null) {
        return { error: "Enter a volume from 20 to 50 mL for 18.0g of whole beans, or leave it blank." };
    }
    const owned = STARTING_BASKETS.filter(basket => setup.ownedBasketIds.includes(basket.id));
    const candidates = basketId === "auto" ? owned : owned.filter(basket => basket.id === basketId);
    if (!candidates.length) return { error: "Select your baskets in Settings → My Baskets." };
    const density = measuredVolume === null ? null : 18 / measuredVolume;
    // A bounded dose heuristic, not a conversion from whole beans to tamped grounds.
    const relativeDensity = measuredVolume === null ? 1 : (setup.referenceVolume || 40) / measuredVolume;
    const preferredDose = clamp(bounded(defaultDose, 5, 30, 18) * clamp(relativeDensity, 0.9, 1.1), setup.doseMin, setup.doseMax);
    const options = candidates.map(basket => {
        const min = Math.max(basket.min, setup.doseMin);
        const max = Math.min(basket.max, setup.doseMax);
        if (min > max) return null;
        const calibration = setup.referenceVolume && measuredVolume ? setup.calibrations[basket.id] : null;
        const idealDose = calibration
            ? (calibration.clearance - setup.headspace) / calibration.puckDepth * calibration.referenceDose * relativeDensity
            : preferredDose;
        const dose = round(clamp(idealDose, min, max));
        const headspace = calibration
            ? round(calibration.clearance - calibration.puckDepth * dose / calibration.referenceDose / relativeDensity)
            : null;
        const score = Math.abs(dose - preferredDose) + (headspace === null ? 0 : Math.abs(headspace - setup.headspace) * 2);
        return { basket, dose, headspace, score };
    }).filter(Boolean).sort((a, b) => a.score - b.score || a.basket.max - b.basket.max);
    if (!options.length) return { error: "Your preferred dose range does not overlap the selected baskets. Adjust the range or basket choice." };
    const choice = options[0];
    const baseline = machineId === "bianca"
        ? getBiancaBaseline(roast, choice.dose, machine.temperatureUnit)
        : getElizabethBaseline(roast, choice.dose, machine.temperatureUnit);
    const ratio = setup.ratio || baseline.ratio;
    const reasons = [];
    const notes = [];
    if (density !== null) {
        reasons.push(`18g occupies ${measuredVolume} mL: apparent whole-bean bulk density ${density.toFixed(3)} g/mL. ${relativeDensity < 0.98 ? "Puffier than" : relativeDensity > 1.02 ? "Denser than" : "Close to"} the ${setup.referenceVolume ? "saved" : "assumed"} 18g / ${setup.referenceVolume || 40} mL baseline.`);
        notes.push("Whole-bean packing, grind and tamp all affect this proxy. The uncalibrated dose adjustment is capped at ±10%; verify dry clearance before brewing.");
    } else reasons.push("No Falcon measurement: using your preferred dose and nominal basket ranges.");
    reasons.push(`${basketId === "auto" ? "Auto selected" : "You selected"} ${choice.basket.name}, with ${choice.dose}g inside both your preferred range and its nominal capacity.`);
    if (choice.headspace === null) {
        notes.push(`Headspace target: ${setup.headspace} mm. A numeric estimate needs your measured reference volume and this basket's calibration. Basket capacity alone does not establish clearance.`);
    } else {
        reasons.push(`Estimated clearance uses your basket calibration and assumes tamped density changes proportionally to whole-bean density. Target: ${setup.headspace} mm.`);
        notes.push("Headspace is an approximate proxy, not a measured clearance. Calibration is specific to this machine, basket and puck-screen arrangement.");
        if (choice.headspace <= 0) notes.push("Estimated puck contact: reduce dose or choose a larger basket before brewing.");
        else if (Math.abs(choice.headspace - setup.headspace) > 1) notes.push("This basket cannot meet your headspace target within the allowed dose range. Try another basket or dose range.");
    }
    if (process !== "unknown") reasons.push(`Process: ${process}. Recorded as context; it does not prescribe a grind offset.`);
    let preinfusion = baseline.preinfusion;
    if (machineId === "bianca") preinfusion = "Paddle fully open; PI and low-flow automation off for the first shot";
    else if (machine.machineVersion === "elizabeth3") preinfusion = "Use your Elizabeth3 Pagaia starting profile; classic timings do not apply";
    else if (machine.machineVersion === "unknown" || machine.machineVersion === "classic-early") preinfusion = "Use your revision's manual; no V3 pump-pause prescription";
    else if (machine.preinfusionMode === "none") preinfusion = "Off, following your saved control mode";
    else preinfusion += machine.preinfusionMode === "bloom" ? " total in bloom mode" : " total; steam/auto hold is gentle pressure, not a pump-off pause";
    return {
        ...choice,
        density,
        ratio,
        yield: round(choice.dose * ratio),
        temperature: baseline.temperature,
        temperatureUnit: baseline.temperatureUnit,
        time: baseline.timeRange,
        preinfusion,
        grind: setup.baselineGrind ? `Start at ${setup.baselineGrind}${setup.grinderName ? ` on ${setup.grinderName}` : ""}; adjust from the first shot's flow` : "Start in your grinder’s espresso range; adjust from the first shot’s flow",
        reasons,
        notes,
        canLog: choice.headspace === null || choice.headspace > 0
    };
};
