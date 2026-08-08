const roastBaselines = {
    dark: {
        name: "Dark / traditional",
        temperature: 196,
        temperatureBounds: [190, 198],
        ratio: 1.75,
        ratioRange: "1:1.5–2.0",
        timeRange: "25–35s total",
        flow: "Full paddle; no automation",
        preinfusion: "Off or 3–5s low flow",
        peakPressure: "8–9 bar",
        profile: "Standard"
    },
    medium: {
        name: "Medium / everyday",
        temperature: 200,
        temperatureBounds: [198, 203],
        ratio: 2,
        ratioRange: "1:1.8–2.2",
        timeRange: "30–40s total",
        flow: "Low-flow start 8–10s",
        preinfusion: "PI off initially",
        peakPressure: "8–9 bar",
        profile: "Gentle ramp"
    },
    light: {
        name: "Light / dense",
        temperature: 205,
        temperatureBounds: [203, 207],
        ratio: 2.5,
        ratioRange: "1:2.3–3.0",
        timeRange: "35–55s total",
        flow: "Low-flow start 10–15s",
        preinfusion: "Compare ramp vs 5s on / 5–10s off",
        peakPressure: "6–9 bar by taste",
        profile: "Modern / bloom"
    }
};

export const BIANCA_SOURCES = [
    {
        id: "lelit-guide",
        title: "Lelit Bianca PL162T V3 Extended Guide",
        url: "https://witt.kontainer.com/cdn/5FPG9Wt/lelit-52230005-bianca-pl162t-eucw-8009437002764-userguide-en.pdf",
        quality: "Manufacturer guide"
    },
    {
        id: "lelit-v3-features",
        title: "Lelit Bianca V3 feature and factory-setting guide",
        url: "https://www.maxicoffee.com/images/pdf/BiancaV3.pdf",
        quality: "Manufacturer guide"
    },
    {
        id: "lelit-us",
        title: "Lelit Bianca US specification",
        url: "https://www.lelit.com/en-us/product/bianca-pesbn03",
        quality: "Manufacturer"
    },
    {
        id: "lelit-low-flow-video",
        title: "Lelit: Bianca V3 pre-infusion and low flow",
        url: "https://www.youtube.com/watch?v=67mBPZNeHc0",
        quality: "Manufacturer video"
    },
    {
        id: "kaffeemacher",
        title: "Kaffeemacher Bianca V3 instrumented test",
        url: "https://kaffeemacher.de/en/blogs/kaffeewissen/lelit-bianca",
        quality: "Instrumented review"
    },
    {
        id: "prima",
        title: "Prima Coffee Bianca V3 low-flow overview",
        url: "https://prima-coffee.com/learn/video/overviews/video-overview-lelit-bianca-v3-home-espresso-machine/",
        quality: "Specialist retailer"
    },
    {
        id: "community-settings",
        title: "Bianca V3 owner settings discussion",
        url: "https://www.reddit.com/r/Lelit/comments/115hji0/",
        quality: "Community consensus"
    },
    {
        id: "community-preinfusion",
        title: "Bianca pre-infusion owner workflows",
        url: "https://www.reddit.com/r/Lelit/comments/176d8ly/",
        quality: "Owner reports"
    },
    {
        id: "version-reference",
        title: "Bianca V1/V2/V3 technical support and diagrams",
        url: "https://www.1st-line.com/buy/lelit-bianca-dual-boiler-pid-espresso-machine/",
        quality: "Service reference"
    }
];

export const BIANCA_ADVANCED_PARAMETERS = [
    { name: "PI ON / OFF", text: "V3 runs the pump for PI ON, stops it for PI OFF, then begins normal extraction. Each phase is 1–20 seconds. This is not line-pressure pre-infusion." },
    { name: "Low-flow START", text: "V3 restricts flow from lever-up until the programmed second. Pressure still depends on puck resistance and paddle position." },
    { name: "Low-flow FINAL", text: "V3 restricts flow from the programmed second until lever-down, making a repeatable declining finish." },
    { name: "Brew offset", text: "Changes the during-shot temperature compensation, not the displayed idle setpoint. Leave 0°F initially; test only after the base recipe repeats." },
    { name: "PID constants", text: "Technical-menu KPc/KIc/KDc and steam PID values are service-level diagnostics. Photograph defaults and do not tune them alongside flow or pump pressure." },
    { name: "Pump ceiling", text: "The external rotary-pump screw changes the full-flow ceiling globally. The group gauge and pump gauge need not match; leave the factory ceiling until puck prep and flow behavior are understood." }
];

const normalizeUnit = (unit) => String(unit || "F").toUpperCase() === "C" ? "C" : "F";
const numberOrNull = (value) => {
    const number = parseFloat(value);
    return Number.isFinite(number) ? number : null;
};

export const convertBiancaTemperature = (value, fromUnit = "F", toUnit = "C") => {
    const number = numberOrNull(value);
    if (number === null) return null;
    const from = normalizeUnit(fromUnit);
    const to = normalizeUnit(toUnit);
    if (from === to) return number;
    return to === "C" ? Math.round((number - 32) * 5 / 9) : Math.round(number * 9 / 5 + 32);
};

export const getBiancaBaseline = (roast = "medium", dose = 18, temperatureUnit = "F") => {
    const roastKey = roastBaselines[String(roast || "medium").toLowerCase()] ? String(roast).toLowerCase() : "medium";
    const baseline = roastBaselines[roastKey];
    const unit = normalizeUnit(temperatureUnit);
    const parsedDose = numberOrNull(dose);
    const safeDose = parsedDose && parsedDose > 0 ? parsedDose : 18;
    const temperature = unit === "F" ? baseline.temperature : convertBiancaTemperature(baseline.temperature, "F", "C");
    const bounds = baseline.temperatureBounds.map(value => unit === "F" ? value : convertBiancaTemperature(value, "F", "C"));
    return {
        ...baseline,
        roast: roastKey,
        dose: safeDose,
        yield: Math.round(safeDose * baseline.ratio * 10) / 10,
        temperature,
        temperatureUnit: unit,
        temperatureRange: `${bounds[0]}–${bounds[1]}°${unit}`
    };
};

export const explainBiancaFlow = ({ machineVersion = "v3", lowFlowStart = 0, lowFlowFinal = 0, preinfusionOn = 0, preinfusionOff = 0 } = {}) => {
    if (machineVersion !== "v3") return "V1/V2 have the manual paddle but not factory V3 low-flow automation. Verify whether an authorized V3 conversion was installed.";
    const phases = [];
    if (numberOrNull(preinfusionOn) > 0) phases.push(`${numberOrNull(preinfusionOn)}s pump-on`);
    if (numberOrNull(preinfusionOff) > 0) phases.push(`${numberOrNull(preinfusionOff)}s pump-off`);
    if (numberOrNull(lowFlowStart) > 0) phases.push(`low flow through ${numberOrNull(lowFlowStart)}s`);
    if (numberOrNull(lowFlowFinal) > 0) phases.push(`low flow again from ${numberOrNull(lowFlowFinal)}s`);
    return phases.length
        ? `Programmed timeline: ${phases.join(" → ")}. The paddle can further restrict any phase, so keep it fully open when testing automation.`
        : "Automation is off: the paddle alone controls flow. Fully open is the cleanest baseline for dialing dose, yield, grind, and puck prep.";
};

export const diagnoseBiancaShot = (context = {}) => {
    const baseline = getBiancaBaseline(context.roast, context.dose, context.temperatureUnit);
    const symptom = String(context.symptom || "starting").toLowerCase();
    const pressure = numberOrNull(context.pressure);
    const actions = [];
    const warnings = [];

    if (symptom === "starting") {
        actions.push(`Start ${baseline.dose}g in → ${baseline.yield}g out (${baseline.ratioRange}); use a scale and stop by beverage mass.`);
        actions.push("Turn programmed pre-infusion and low-flow OFF, set the paddle fully open, and dial grind before profiling.");
        actions.push(`Begin at ${baseline.temperature}°${baseline.temperatureUnit}; move only 2°F (1°C) at a time after flow is repeatable.`);
        if (baseline.roast !== "dark") actions.push(`Then A/B test ${baseline.flow.toLowerCase()} without changing dose, yield, grind, or temperature.`);
    } else if (symptom === "fast" || symptom === "sour") {
        actions.push("Keep the paddle and automation unchanged; grind finer in one small step and repeat at the same dose and yield.");
        actions.push("If flow is even and the target yield is already slow enough, extend ratio slightly before raising temperature.");
        actions.push("Only after the base recipe repeats, compare an 8–10s low-flow ramp for gentler saturation.");
    } else if (symptom === "slow" || symptom === "bitter") {
        actions.push("Keep the paddle and automation unchanged; grind coarser in one small step and repeat at the same dose and yield.");
        actions.push("If flow is even but the cup stays dry or roasty, shorten yield or lower temperature 2°F (1°C). ");
        actions.push("Disable bloom or long low-flow phases before changing pump pressure.");
    } else if (symptom === "channeling" || symptom === "astringent") {
        actions.push("Reset to full paddle with automation off; inspect headspace and make distribution and tamp repeatable.");
        actions.push("Grind slightly coarser if the shot stalls before spraying; a long profile cannot repair a fractured puck.");
        actions.push("Once the standard shot is even, retry low flow as a controlled A/B test.");
    } else if (symptom === "hollow") {
        actions.push("Hold dose and puck prep constant; increase beverage yield by about 10% and taste again.");
        actions.push("If the shot is fast, grind finer before adding pre-infusion or raising temperature.");
        actions.push("For light coffee only after dial-in, compare a 5s pump-on / 5–10s pump-off bloom.");
    } else {
        actions.push("Save this dose, yield, grind, temperature, and flow timeline before experimenting.");
        actions.push("Change only one of paddle position, programmed pre-infusion, low-flow start, or low-flow final next.");
    }

    if (pressure !== null && pressure < 6 && ["fast", "sour", "hollow"].includes(symptom)) {
        warnings.push("Low pressure plus fast or weak flow usually means insufficient puck resistance—not a pump fault. Verify grind, dose, headspace, and prep first.");
    }
    if (pressure !== null && pressure > 10) {
        warnings.push("A high gauge reading is not a flavor target. Compare group and pump gauges under flow; leave the external pump screw alone until a standard shot repeats.");
    }
    if (context.machineVersion && context.machineVersion !== "v3") {
        warnings.push("This machine is marked V1/V2 or unknown. Do not copy V3 low-flow timing unless an authorized conversion is confirmed.");
    }
    warnings.push("The paddle controls flow, not a fixed pressure. The same position can produce different pressure as the puck changes.");

    return {
        baseline,
        summary: `${baseline.name}: ${baseline.profile} starting plan`,
        actions,
        warnings,
        sourceIds: ["lelit-guide", "lelit-v3-features", "kaffeemacher", "community-settings"]
    };
};
