const ELIZABETH_DEFAULTS = {
    machineVersion: "classic-v3",
    firmware: "",
    temperatureUnit: "F",
    brewTemperature: 200,
    steamTemperature: 275,
    observedPressure: "",
    preinfusionMode: "auto"
};

const BIANCA_DEFAULTS = {
    machineVersion: "v3",
    firmware: "",
    temperatureUnit: "F",
    brewTemperature: 200,
    steamTemperature: 257,
    observedPressure: "",
    brewOffset: 0,
    preinfusionOn: 0,
    preinfusionOff: 0,
    lowFlowStart: 0,
    lowFlowFinal: 0
};

const ELIZABETH_MAINTENANCE_PRESETS = [
    { type: "Steam wand clean", icon: "💨", title: "Steam wand", action: "Wand cleaned", cadence: "After every use", detail: "Wipe with a damp cloth and purge briefly." },
    { type: "Filterholder clean", icon: "☕", title: "Filterholder", action: "Filterholder cleaned", cadence: "After every use", detail: "Remove oily coffee residue after brewing." },
    { type: "Machine clean", icon: "✨", title: "Machine wipe-down", action: "Machine cleaned", cadence: "Weekly", detail: "Soft cloth and plain water.", daysUntilDue: 7 },
    { type: "Backflush", icon: "💧", title: "Backflush", action: "Backflush done", cadence: "Monthly", detail: "Blind filter and 3–5 g detergent.", monthsUntilDue: 1 },
    { type: "Water filter", icon: "🚰", title: "Resin filter", action: "Filter changed", cadence: "By water usage", detail: "Follow the liter capacity on the filter pack." }
];

const BIANCA_MAINTENANCE_PRESETS = [
    { type: "Daily group and tray care", icon: "☕", title: "Group, basket & tray", action: "Daily care done", cadence: "After shots / daily", detail: "Wash basket and portafilter, brush the gasket, and hand-wash the tray." },
    { type: "Steam wand clean", icon: "💨", title: "Steam wand", action: "Wand cleaned", cadence: "After every milk drink", detail: "Wipe immediately and purge briefly." },
    { type: "Detergent backflush", icon: "💧", title: "Detergent backflush", action: "Backflush done", cadence: "Weekly", detail: "10s on / 10s off ×10; rinse, then water-only ×5.", daysUntilDue: 7 },
    { type: "Portafilter and basket soak", icon: "🧼", title: "Metal parts soak", action: "Parts cleaned", cadence: "Weekly", detail: "15 minutes; keep the wooden handle out of solution.", daysUntilDue: 7 },
    { type: "Steam wand deep clean", icon: "✨", title: "Wand deep clean", action: "Deep clean done", cadence: "Weekly", detail: "Use milk-system detergent and the manual's 5s on/off cycle.", daysUntilDue: 7 },
    { type: "Water filter", icon: "🚰", title: "Water filter", action: "Filter changed", cadence: "70 L or 4 months", detail: "Replace earlier after one month unused.", monthsUntilDue: 4 },
    { type: "Professional annual service", icon: "🛠️", title: "Professional service", action: "Annual service done", cadence: "Annual", detail: "Technician inspection and hydraulic descaling.", monthsUntilDue: 12 }
];

export const normalizeElizabethProfile = (value = {}) => {
    const temperatureUnit = value.temperatureUnit === "C" ? "C" : "F";
    return {
        machineVersion: ["classic-v3", "classic-early", "elizabeth3", "unknown"].includes(value.machineVersion) ? value.machineVersion : ELIZABETH_DEFAULTS.machineVersion,
        firmware: typeof value.firmware === "string" ? value.firmware : ELIZABETH_DEFAULTS.firmware,
        temperatureUnit,
        brewTemperature: Number.isFinite(parseFloat(value.brewTemperature)) ? parseFloat(value.brewTemperature) : (temperatureUnit === "F" ? 200 : 93),
        steamTemperature: Number.isFinite(parseFloat(value.steamTemperature)) ? parseFloat(value.steamTemperature) : (temperatureUnit === "F" ? 275 : 135),
        observedPressure: Number.isFinite(parseFloat(value.observedPressure)) ? parseFloat(value.observedPressure) : ELIZABETH_DEFAULTS.observedPressure,
        preinfusionMode: ["auto", "steam", "bloom", "none"].includes(value.preinfusionMode) ? value.preinfusionMode : ELIZABETH_DEFAULTS.preinfusionMode
    };
};

export const normalizeBiancaProfile = (value = {}) => {
    const temperatureUnit = value.temperatureUnit === "C" ? "C" : "F";
    const numberOr = (field, fallback) => Number.isFinite(parseFloat(value[field])) ? parseFloat(value[field]) : fallback;
    return {
        machineVersion: ["v3", "v2", "v1", "unknown"].includes(value.machineVersion) ? value.machineVersion : BIANCA_DEFAULTS.machineVersion,
        firmware: typeof value.firmware === "string" ? value.firmware : BIANCA_DEFAULTS.firmware,
        temperatureUnit,
        brewTemperature: numberOr("brewTemperature", temperatureUnit === "F" ? 200 : 93),
        steamTemperature: numberOr("steamTemperature", temperatureUnit === "F" ? 257 : 125),
        observedPressure: Number.isFinite(parseFloat(value.observedPressure)) ? parseFloat(value.observedPressure) : BIANCA_DEFAULTS.observedPressure,
        brewOffset: numberOr("brewOffset", BIANCA_DEFAULTS.brewOffset),
        preinfusionOn: numberOr("preinfusionOn", BIANCA_DEFAULTS.preinfusionOn),
        preinfusionOff: numberOr("preinfusionOff", BIANCA_DEFAULTS.preinfusionOff),
        lowFlowStart: numberOr("lowFlowStart", BIANCA_DEFAULTS.lowFlowStart),
        lowFlowFinal: numberOr("lowFlowFinal", BIANCA_DEFAULTS.lowFlowFinal)
    };
};

export const normalizeUserProfile = (data = {}) => ({
    machineId: data.machineId === "bianca" ? "bianca" : "elizabeth",
    machineName: data.machineName || (data.machineId === "bianca" ? "Lelit Bianca" : "Lelit Elizabeth"),
    defaultDose: parseFloat(data.defaultDose) || 18,
    finerDirection: data.finerDirection === "higher" ? "higher" : "lower",
    b1: data.b1 || { infusion: data.infusion || 3, bloom: 2, brew: 25 },
    b2: data.b2 || { infusion: 5, bloom: 7, brew: 28 },
    elizabeth: normalizeElizabethProfile(data.elizabeth),
    bianca: normalizeBiancaProfile(data.bianca)
});

export const createDefaultUserProfile = () => normalizeUserProfile();

export const recordMachineId = (record) => record?.machineId === "bianca" ? "bianca" : "elizabeth";

export const maintenancePresetsFor = (machineId) => machineId === "bianca" ? BIANCA_MAINTENANCE_PRESETS : ELIZABETH_MAINTENANCE_PRESETS;

export const parseDateKey = (value) => value ? new Date(`${value}T00:00:00`) : null;

export const localDateKey = (date = new Date()) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
].join("-");

export const maintenanceTime = (record) => parseDateKey(record?.completedDate)?.getTime() || 0;

export const presetDueDate = (preset, completedDate) => {
    const date = parseDateKey(completedDate);
    if (!date) return "";
    if (preset.daysUntilDue) date.setDate(date.getDate() + preset.daysUntilDue);
    else if (preset.monthsUntilDue) {
        const day = date.getDate();
        date.setDate(1);
        date.setMonth(date.getMonth() + preset.monthsUntilDue);
        const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        date.setDate(Math.min(day, lastDay));
    } else return "";
    return localDateKey(date);
};

export const maintenanceDueState = (dueDate, today = new Date()) => {
    const due = parseDateKey(dueDate);
    if (!due || Number.isNaN(due.getTime())) return { tone: "none", label: "No reminder" };
    const currentDate = new Date(today);
    currentDate.setHours(0, 0, 0, 0);
    const days = Math.round((due.getTime() - currentDate.getTime()) / 86400000);
    if (days < 0) return { tone: "overdue", label: `${Math.abs(days)}d overdue` };
    if (days === 0) return { tone: "due", label: "Due today" };
    if (days <= 30) return { tone: "due", label: `Due in ${days}d` };
    return { tone: "scheduled", label: `Due ${due.toLocaleDateString()}` };
};
