export const getAIAdvice = (shot, roastLevel = "Medium") => {
    const ratio = parseFloat(shot.yield) / parseFloat(shot.dose);
    const time = parseFloat(shot.time);
    const roast = (roastLevel || "Medium").toLowerCase();

    const targets = {
        light: { ratio: [2.0, 2.5], time: [30, 40], name: "Light" },
        medium: { ratio: [1.8, 2.2], time: [27, 33], name: "Medium" },
        dark: { ratio: [1.5, 2.0], time: [22, 28], name: "Dark" },
        espresso: { ratio: [1.8, 2.2], time: [25, 32], name: "Espresso" }
    };

    const targetBase = targets[roast] || targets.medium;
    const flowRate = parseFloat(shot.yield) / time;
    let advice = [];
    let status = "good";

    if (ratio >= targetBase.ratio[1] + 0.1) advice.push("Yield too high (Grind Finer)");
    else if (ratio <= targetBase.ratio[0] - 0.1) advice.push("Yield too low (Grind Coarser)");

    if (flowRate > 1.4) advice.push("Fast Flow (Grind Finer)");
    else if (flowRate < 0.9) advice.push("Choked Flow (Grind Coarser)");

    const advisesFiner = advice.some(a => a.includes("Finer"));
    const advisesCoarser = advice.some(a => a.includes("Coarser"));

    if (advisesFiner && advisesCoarser) {
        advice = flowRate > 1.2 ? ["Grind Finer (Flow dominates)"] : ["Grind Coarser (Yield limits)"];
    }

    if (advice.length > 0) {
        status = flowRate > 1.4 || ratio > targetBase.ratio[1] ? "fast" : "slow";
    }

    return {
        text: advice.length > 0 ? advice.join(" • ") : "Golden Range Identified",
        status
    };
};
