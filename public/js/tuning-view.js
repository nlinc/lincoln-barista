import { el } from "./dom.js?v=1.9.4";
import { BIANCA_ADVANCED_PARAMETERS, BIANCA_SOURCES, explainBiancaFlow } from "./bianca-tuning.js?v=1.9.4";
import { ELIZABETH_ADVANCED_PARAMETERS, ELIZABETH_SOURCES, explainPreinfusionMode } from "./elizabeth-tuning.js?v=1.9.4";

const renderParameters = (targetId, parameters) => {
    document.getElementById(targetId).replaceChildren(...parameters.map(parameter => {
        const card = el("div", "advanced-parameter");
        card.append(el("div", "advanced-parameter-name", parameter.name), el("div", "advanced-parameter-copy", parameter.text));
        return card;
    }));
};

const renderSources = (targetId, sources) => {
    document.getElementById(targetId).replaceChildren(...sources.map(source => {
        const link = el("a", "tuning-source");
        link.href = source.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.append(el("span", "tuning-source-title", source.title), el("span", "tuning-source-quality", source.quality));
        return link;
    }));
};

const renderPlan = ({ targetId, kicker, metrics: metricValues, summary, warnings, actions: actionValues }) => {
    const plan = el("div", "card tuning-plan-card");
    const heading = el("div", "tuning-plan-heading");
    const headingText = el("div");
    headingText.append(el("div", "field-kicker", kicker), el("h3", "", summary));
    heading.append(headingText, el("span", "evidence-badge", "Consensus start"));

    const metrics = el("div", "tuning-baseline-grid");
    metricValues.forEach(([value, label]) => {
        const item = el("div", "tuning-baseline-item");
        item.append(el("span", "tuning-baseline-value", value), el("span", "tuning-baseline-label", label));
        metrics.appendChild(item);
    });

    const actions = el("ol", "tuning-actions");
    actionValues.forEach(action => actions.appendChild(el("li", "", action)));
    plan.append(heading, metrics, actions);
    warnings.forEach(warning => plan.appendChild(el("div", "tuning-warning", warning)));
    document.getElementById(targetId).replaceChildren(plan);
};

export const renderElizabethReference = (profile) => {
    const versionNames = {
        "classic-v3": "Classic V3",
        "classic-early": "Early classic",
        elizabeth3: "Elizabeth3 / Pagaia",
        unknown: "Version unknown"
    };
    document.getElementById("tuning-machine-chip").textContent = versionNames[profile.machineVersion];
    const profileParts = [
        `${profile.brewTemperature}°${profile.temperatureUnit} brew`,
        `${profile.steamTemperature}°${profile.temperatureUnit} steam`,
        profile.preinfusionMode + " pre-infusion"
    ];
    if (profile.firmware) profileParts.push("firmware " + profile.firmware);
    document.getElementById("tuning-profile-context").textContent = "Your saved machine: " + profileParts.join(" • ");
    document.getElementById("tuning-mode-explanation").textContent = explainPreinfusionMode(profile);

    const warning = document.getElementById("tuning-version-warning");
    if (profile.machineVersion === "classic-v3") warning.classList.add("hidden");
    else {
        warning.textContent = profile.machineVersion === "elizabeth3"
            ? "Elizabeth3 is a different Pagaia platform. The classic P1/P2 and BLS/BLP profiles below are reference-only and must not be copied to it."
            : profile.machineVersion === "classic-early"
                ? "Early PL92T detected. V3 pump-bloom, purge, and OPV instructions may not apply; verify your firmware manual before using advanced controls."
                : "Choose your Elizabeth generation in Settings before using hidden-menu or hardware guidance.";
        warning.className = "status-strip status-warning";
    }
    renderParameters("tuning-advanced-parameters", ELIZABETH_ADVANCED_PARAMETERS);
    renderSources("tuning-sources", ELIZABETH_SOURCES);
};

export const renderElizabethPlan = (advice) => renderPlan({
    targetId: "tuning-plan",
    kicker: advice.baseline.button + " starting profile",
    summary: advice.summary,
    metrics: [
        [`${advice.baseline.dose}g → ${advice.baseline.yield}g`, "Dose → yield"],
        [`${advice.baseline.temperature}°${advice.baseline.temperatureUnit}`, advice.baseline.temperatureRange],
        [advice.baseline.preinfusion, "Total pre-infusion"],
        [advice.baseline.timeRange, "Includes pre-infusion"]
    ],
    actions: advice.actions,
    warnings: advice.warnings
});

export const renderBiancaReference = (profile) => {
    const names = { v3: "V3 · 120V", v2: "V2 · 120V", v1: "V1 · 120V", unknown: "Version unknown" };
    document.getElementById("bianca-tuning-machine-chip").textContent = names[profile.machineVersion];
    const parts = [
        `${profile.brewTemperature}°${profile.temperatureUnit} brew`,
        `${profile.steamTemperature}°${profile.temperatureUnit} steam`,
        `${profile.observedPressure || "—"} bar group peak`
    ];
    if (profile.firmware) parts.push("firmware " + profile.firmware);
    document.getElementById("bianca-tuning-profile-context").textContent = "Your saved machine: " + parts.join(" • ");
    document.getElementById("bianca-tuning-flow-explanation").textContent = explainBiancaFlow(profile);

    const warning = document.getElementById("bianca-tuning-version-warning");
    if (profile.machineVersion === "v3") warning.classList.add("hidden");
    else {
        warning.textContent = profile.machineVersion === "unknown"
            ? "Choose the Bianca generation in Settings before copying programmed low-flow timings. PL162T-120 identifies voltage, not V1/V2/V3."
            : `${profile.machineVersion.toUpperCase()} selected: manual paddle profiles apply, but factory V3 low-flow and brew-offset controls do not unless an authorized conversion is installed.`;
        warning.className = "status-strip status-warning";
    }
    renderParameters("bianca-tuning-advanced-parameters", BIANCA_ADVANCED_PARAMETERS);
    renderSources("bianca-tuning-sources", BIANCA_SOURCES);
};

export const renderBiancaPlan = (advice) => renderPlan({
    targetId: "bianca-tuning-plan",
    kicker: advice.baseline.profile + " starting profile",
    summary: advice.summary,
    metrics: [
        [`${advice.baseline.dose}g → ${advice.baseline.yield}g`, advice.baseline.ratioRange],
        [`${advice.baseline.temperature}°${advice.baseline.temperatureUnit}`, advice.baseline.temperatureRange],
        [advice.baseline.flow, advice.baseline.preinfusion],
        [advice.baseline.peakPressure, advice.baseline.timeRange]
    ],
    actions: advice.actions,
    warnings: advice.warnings
});
