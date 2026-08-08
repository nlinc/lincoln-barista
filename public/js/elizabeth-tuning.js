const roastBaselines = {
    dark: {
        name: "Dark / traditional",
        temperature: 196,
        temperatureBounds: [190, 198],
        ratio: 1.75,
        ratioRange: "1:1.5–2.0",
        timeRange: "25–35s total",
        preinfusion: "Off or 3–5s",
        pumpSeconds: 3,
        holdSeconds: 2,
        fullPressureSeconds: 25,
        mode: "none",
        button: "P1"
    },
    medium: {
        name: "Medium / everyday",
        temperature: 200,
        temperatureBounds: [196, 201],
        ratio: 2,
        ratioRange: "1:1.8–2.2",
        timeRange: "30–40s total",
        preinfusion: "6–10s",
        pumpSeconds: 3,
        holdSeconds: 5,
        fullPressureSeconds: 27,
        mode: "steam",
        button: "P1"
    },
    light: {
        name: "Light / dense",
        temperature: 203,
        temperatureBounds: [201, 205],
        ratio: 2.5,
        ratioRange: "1:2.3–3.0",
        timeRange: "35–50s total",
        preinfusion: "10–15s",
        pumpSeconds: 5,
        holdSeconds: 7,
        fullPressureSeconds: 28,
        mode: "compare steam vs bloom",
        button: "P2"
    }
};

export const ELIZABETH_SOURCES = [
    {
        id: "lelit-extended",
        title: "Lelit PL92T Extended Guide (2021)",
        url: "https://www.maxicoffee.com/images/pdf/TECH_PL92T_ELIZABETH_extended_guide_2021_REV00.pdf",
        quality: "Manufacturer guide"
    },
    {
        id: "lelit-product",
        title: "Lelit Elizabeth PL92T product specification",
        url: "https://www.lelit.com/product/elizabeth-pl92t/",
        quality: "Manufacturer"
    },
    {
        id: "lelit-elizabeth3",
        title: "Lelit Elizabeth3 PL92T3",
        url: "https://www.lelit.com/it/prodotto/elizabeth3-pl92t3/",
        quality: "Manufacturer"
    },
    {
        id: "quick-reference",
        title: "Dave Corbey's Elizabeth LCC quick reference",
        url: "https://www.manualslib.com/manual/1935808/Lelit-Elizabeth.html",
        quality: "Independent expert"
    },
    {
        id: "kaffeemacher",
        title: "Kaffeemacher Elizabeth testing and recipes",
        url: "https://kaffeemacher.de/en/blogs/kaffeewissen/lelit-elizabeth-pl92t-im-test",
        quality: "Instrumented review"
    },
    {
        id: "coffeetime",
        title: "Elizabeth pre-infusion and recipe discussion",
        url: "https://coffeetime.freeflarum.com/d/431-lelit-elizabeth-recommended-preinfusiontimingtemp-settings/19",
        quality: "Community consensus"
    },
    {
        id: "pressure-blog",
        title: "Owner pressure-tuning walkthrough",
        url: "https://blog.headdesk.me/2022/12/lelit-elizabeth-pl92t-pressure-tuning/",
        quality: "Owner report"
    },
    {
        id: "pressure-concepts",
        title: "James Hoffmann: understanding espresso pressure",
        url: "https://www.youtube.com/watch?v=po3oGIicu-8",
        quality: "Conceptual video"
    },
    {
        id: "flowing-pressure",
        title: "Static versus flowing pressure experiment",
        url: "https://www.reddit.com/r/Lelit/comments/1aeeisx/elizabeth_pl92t_a_diy_scace_and_my_thoughts_on/",
        quality: "Owner experiment"
    },
    {
        id: "pid-defaults",
        title: "PL92T factory PID settings",
        url: "https://www.1st-line.com/technical-support/lelit-technical-support-page/pid-default-settings-lelit-pl92t-elizabeth/",
        quality: "Service reference"
    }
];

const normalizeRoast = (roast) => {
    const value = String(roast || "medium").toLowerCase();
    return roastBaselines[value] ? value : "medium";
};

const numberOrNull = (value) => {
    const number = parseFloat(value);
    return Number.isFinite(number) ? number : null;
};

const normalizeTemperatureUnit = (unit) => String(unit || "F").toUpperCase() === "C" ? "C" : "F";

export const convertTemperature = (value, fromUnit = "F", toUnit = "C") => {
    const number = numberOrNull(value);
    if (number === null) return null;
    const from = normalizeTemperatureUnit(fromUnit);
    const to = normalizeTemperatureUnit(toUnit);
    if (from === to) return number;
    return to === "C" ? Math.round((number - 32) * 5 / 9) : Math.round(number * 9 / 5 + 32);
};

export const getElizabethBaseline = (roast = "medium", dose = 18, temperatureUnit = "F") => {
    const key = normalizeRoast(roast);
    const baseline = roastBaselines[key];
    const unit = normalizeTemperatureUnit(temperatureUnit);
    const parsedDose = numberOrNull(dose);
    const safeDose = parsedDose && parsedDose > 0 ? parsedDose : 18;
    const temperature = unit === "F" ? baseline.temperature : convertTemperature(baseline.temperature, "F", "C");
    const temperatureBounds = baseline.temperatureBounds.map(value => unit === "F" ? value : convertTemperature(value, "F", "C"));
    return {
        ...baseline,
        temperature,
        temperatureUnit: unit,
        temperatureRange: `${temperatureBounds[0]}–${temperatureBounds[1]}°${unit}`,
        roast: key,
        dose: safeDose,
        yield: Math.round(safeDose * baseline.ratio * 10) / 10,
        totalProgramSeconds: baseline.pumpSeconds + baseline.holdSeconds + baseline.fullPressureSeconds
    };
};

export const explainPreinfusionMode = ({ machineVersion = "classic-v3", mode = "auto", steamTemperature = 275, temperatureUnit = "F" } = {}) => {
    if (machineVersion === "elizabeth3") {
        return "Elizabeth3 uses Pagaia multi-step flow and pressure profiles. Classic PL92T BLS/BLP instructions do not apply.";
    }
    if (machineVersion === "classic-early") {
        return "Early PL92T revisions rely on the steam boiler for pre-infusion and do not have V3 pump-bloom behavior. Verify the manual for your firmware.";
    }
    const unit = normalizeTemperatureUnit(temperatureUnit);
    const threshold = unit === "F" ? 239 : 115;
    if (mode === "bloom") return "Bloom: BLP wets the puck, the pump pauses for the rest of total pre-infusion, then full brewing starts.";
    if (mode === "steam") return numberOrNull(steamTemperature) >= threshold
        ? "Steam: BLS wets the puck, steam-boiler pressure gently continues for the rest of total pre-infusion, then full brewing starts."
        : `Steam pre-infusion is requested, but the boiler must be at least ${threshold}°${unit}; below that threshold classic V3 uses bloom behavior.`;
    if (mode === "none") return "No pre-infusion: full pump pressure begins immediately. This is a valid baseline, especially for soluble dark roasts.";
    return numberOrNull(steamTemperature) >= threshold
        ? `Auto/EVS 1: steam boiler on and at least ${threshold}°${unit} selects steam pre-infusion; switching it off selects bloom on classic V3.`
        : `Auto/EVS 1: below ${threshold}°${unit} the classic V3 cannot select steam pre-infusion and will use bloom behavior.`;
};

export const diagnoseElizabethShot = (context = {}) => {
    const baseline = getElizabethBaseline(context.roast, context.dose, context.temperatureUnit);
    const symptom = String(context.symptom || "starting").toLowerCase();
    const pressure = numberOrNull(context.pressure);
    const time = numberOrNull(context.time);
    const yieldValue = numberOrNull(context.yield);
    const dose = numberOrNull(context.dose);
    const ratio = dose && yieldValue ? yieldValue / dose : null;
    const actions = [];
    const warnings = [];

    if (symptom === "starting") {
        actions.push(`Start at ${baseline.dose}g in and stop the shot at ${baseline.yield}g on a scale.`);
        actions.push(context.startingGrind
            ? `Begin at your saved grinder setting ${context.startingGrind}; grinder numbers are only meaningful on your grinder.`
            : "Start in your grinder's espresso range. There is no transferable Elizabeth grind number, so use flow to find the setting.");
        actions.push(`Use ${baseline.temperature}°${baseline.temperatureUnit} and ${baseline.preinfusion.toLowerCase()}; leave the timed auto-stop OFF while dialing in.`);
        actions.push("Adjust grind until flow is controlled, then judge the ratio by taste. Change temperature and pre-infusion only after that baseline repeats.");
    } else if (symptom === "sour") {
        if (ratio === null || ratio < baseline.ratio) actions.push(`Extend yield toward ${baseline.ratioRange} before changing the machine.`);
        else actions.push("If the shot is still fast or pale, grind finer; keep dose and yield fixed for the comparison.");
        actions.push(`Once flow and yield repeat, raise brew temperature ${baseline.temperatureUnit === "F" ? "2°F" : "1°C"}. For light coffee, test a slightly longer pre-infusion as a separate experiment.`);
    } else if (symptom === "bitter" || symptom === "astringent") {
        if (time !== null && time > 40) actions.push("Grind coarser first; the shot is spending a long time under extraction.");
        else actions.push(`Shorten yield toward ${baseline.ratioRange}; keep dose fixed.`);
        actions.push(`If the result remains dry or roasty, lower brew temperature ${baseline.temperatureUnit === "F" ? "2°F" : "1°C"}. Shorten or disable pre-infusion on darker coffee.`);
    } else if (symptom === "channeling") {
        actions.push("Fix distribution first: full-depth WDT, level bed, level tamp, and basket-appropriate headspace.");
        actions.push("If the puck is extremely fine or stalls before spraying, move slightly coarser. Do not use temperature to solve uneven flow.");
    } else if (symptom === "fast") {
        actions.push("Keep dose and target yield fixed, then grind finer. Check stale coffee, under-dosing, and edge channeling if pressure also falls.");
    } else if (symptom === "slow") {
        actions.push("Keep dose and target yield fixed, then grind coarser. Reduce dose only if the basket lacks headspace.");
    } else if (symptom === "hollow") {
        actions.push("Taste a shorter and a longer yield around the current recipe; hollow shots can be weak or uneven rather than simply under-extracted.");
        actions.push("Inspect bottomless flow and puck preparation before changing temperature or pressure.");
    } else if (symptom === "balanced") {
        actions.push("Save this recipe and repeat it before changing anything. Taste is the target; the gauge and timer are diagnostic tools.");
    }

    if (pressure !== null && pressure > 10.5) {
        warnings.push("A high gauge number alone does not justify OPV adjustment. Compare static blind-basket pressure with flowing-shot pressure and fix puck preparation first.");
    } else if (pressure !== null && pressure < 7 && symptom !== "slow") {
        warnings.push("Low pressure with fast flow usually means insufficient puck resistance. If a blind basket also stays low, stop dialing and arrange service.");
    }

    if (context.machineVersion === "classic-early") warnings.push("This is an early PL92T: V3 bloom and purge instructions may not exist on your firmware.");
    if (context.machineVersion === "elizabeth3") warnings.push("Classic PL92T recommendations are disabled for Elizabeth3/Pagaia; use its native multi-step profiles.");

    return {
        baseline,
        summary: symptom === "starting" ? `Start with ${baseline.button}: ${baseline.name}` : "Change one variable on the next shot",
        actions,
        warnings
    };
};

export const ELIZABETH_ADVANCED_PARAMETERS = [
    { name: "KPc / KIc / KDc / Bc", text: "Coffee-boiler PID response. Firmware defaults vary; judge changes over several days, not one displayed swing." },
    { name: "KPs / KIs / KDs / Bs", text: "Steam-boiler PID response. This affects steaming and can change steam-pre-infusion behavior." },
    { name: "Ec / Es", text: "Controller temperature offsets. Ec=10 does not mean adding 10 degrees to your recipe; changing it redefines every saved setpoint." },
    { name: "TR", text: "Selects actual-versus-target temperature display on compatible firmware. It does not itself change the brew setpoint." },
    { name: "EVS", text: "EVS 1 permits automatic steam/bloom selection; EVS 0 forces bloom on classic V3 even when the steam boiler is hot." },
    { name: "BLS1 / BLS2", text: "Pump-on seconds inside each button's total steam pre-infusion. Community baseline: 3 seconds." },
    { name: "BLP1 / BLP2", text: "Pump-on seconds inside each button's total bloom pre-infusion. Community baseline: 5–6 seconds for a double basket." },
    { name: "F01 / ToT", text: "Display illumination and the total extraction counter on compatible firmware. Parameter lists can differ, so do not alter an unfamiliar code without matching documentation." }
];
