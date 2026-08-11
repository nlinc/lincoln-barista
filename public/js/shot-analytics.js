import { getBrewAdvice } from "./brew-advice.js?v=1.9.3";

const DAY_MS = 86400000;

const toNumber = (value) => {
    const number = parseFloat(value);
    return Number.isFinite(number) ? number : null;
};

const toDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value.toDate === "function") return value.toDate();
    if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
    const normalized = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? value + "T12:00:00"
        : value;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
};

const calendarDaysBetween = (start, end) => {
    const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.round((endDay - startDay) / DAY_MS);
};

const median = (values) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const standardDeviation = (values) => {
    if (values.length < 2) return 0;
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) / values.length;
    return Math.sqrt(variance);
};

const regression = (points) => {
    if (points.length < 2) return null;
    const xMean = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const yMean = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const numerator = points.reduce((sum, point) => sum + (point.x - xMean) * (point.y - yMean), 0);
    const denominator = points.reduce((sum, point) => sum + Math.pow(point.x - xMean, 2), 0);
    if (!denominator) return null;

    const slope = numerator / denominator;
    const intercept = yMean - slope * xMean;
    const totalVariance = points.reduce((sum, point) => sum + Math.pow(point.y - yMean, 2), 0);
    const residualVariance = points.reduce((sum, point) => {
        const predicted = intercept + slope * point.x;
        return sum + Math.pow(point.y - predicted, 2);
    }, 0);

    return {
        slope,
        intercept,
        r2: totalVariance ? Math.max(0, 1 - residualVariance / totalVariance) : 0
    };
};

const grinderMove = (weeklyChange, finerDirection) => {
    const settingMovesHigher = weeklyChange > 0;
    const finer = finerDirection === "higher" ? settingMovesHigher : !settingMovesHigher;
    return finer ? "finer" : "coarser";
};

const ageWindowLabel = (age) => {
    if (age < 7) return "0–6 days";
    if (age < 14) return "7–13 days";
    if (age < 21) return "14–20 days";
    return "21+ days";
};

export const validateShot = (shot) => {
    const grind = toNumber(shot?.grind);
    const time = toNumber(shot?.time);
    const dose = toNumber(shot?.dose);
    const yieldValue = toNumber(shot?.yield);
    const errors = [];

    if (grind === null) errors.push("Enter a valid grind setting.");
    if (time === null || time <= 0) errors.push("Time must be greater than zero.");
    if (dose === null || dose <= 0) errors.push("Dose must be greater than zero.");
    if (yieldValue === null || yieldValue <= 0) errors.push("Yield must be greater than zero.");

    return {
        valid: errors.length === 0,
        errors,
        values: { grind, time, dose, yield: yieldValue }
    };
};

export const summarizeShotPatterns = (logs, beans = [], options = {}) => {
    const beanLookup = new Map(beans.map(bean => [bean.id, bean]));
    const finerDirection = options.finerDirection === "higher" ? "higher" : "lower";
    const usable = logs.map(log => {
        const validation = validateShot(log);
        const bean = beanLookup.get(log.beanId) || {};
        const shotDate = toDate(log.date);
        const roastDate = toDate(log.roastDate || bean.currentRoastDate);
        if (!validation.valid || !shotDate) return null;
        const age = roastDate ? calendarDaysBetween(roastDate, shotDate) : null;
        const values = validation.values;
        return {
            ...log,
            ...values,
            bean,
            shotDate,
            age: age !== null && age >= 0 ? age : null,
            ratio: values.yield / values.dose,
            flow: values.yield / values.time,
            status: getBrewAdvice(values, bean.roastLevel).status
        };
    }).filter(Boolean).sort((a, b) => a.shotDate - b.shotDate);

    const beanIds = new Set(usable.map(shot => shot.beanId));
    const isSingleBean = beanIds.size === 1;
    const baselines = new Map();
    usable.forEach(shot => {
        if (!baselines.has(shot.beanId)) baselines.set(shot.beanId, shot.grind);
        shot.grindDelta = shot.grind - baselines.get(shot.beanId);
    });

    const agePoints = usable
        .filter(shot => shot.age !== null)
        .map(shot => ({
            x: shot.age,
            y: isSingleBean ? shot.grind : shot.grindDelta,
            beanId: shot.beanId,
            label: shot.bean.name || "Bean"
        }));
    const flowPoints = usable
        .filter(shot => shot.age !== null)
        .map(shot => ({ x: shot.age, y: shot.flow }));
    const ageSpan = agePoints.length
        ? Math.max(...agePoints.map(point => point.x)) - Math.min(...agePoints.map(point => point.x))
        : 0;
    const ageRegression = agePoints.length >= 4 && ageSpan >= 7 ? regression(agePoints) : null;
    const flowRegression = flowPoints.length >= 4 && ageSpan >= 7 ? regression(flowPoints) : null;
    const ratios = usable.map(shot => shot.ratio);
    const goodShots = usable.filter(shot => shot.status === "good");
    const dialedPercent = usable.length ? Math.round(goodShots.length / usable.length * 100) : 0;

    const windows = new Map();
    usable.filter(shot => shot.age !== null).forEach(shot => {
        const label = ageWindowLabel(shot.age);
        const window = windows.get(label) || { label, total: 0, good: 0 };
        window.total++;
        if (shot.status === "good") window.good++;
        windows.set(label, window);
    });
    const bestWindow = [...windows.values()]
        .filter(window => window.total >= 3)
        .sort((a, b) => (b.good / b.total) - (a.good / a.total) || b.total - a.total)[0] || null;

    const insights = [];
    if (ageRegression && Math.abs(ageRegression.slope * 7) >= 0.05) {
        const weeklyChange = ageRegression.slope * 7;
        const direction = weeklyChange > 0 ? "higher" : "lower";
        const move = grinderMove(weeklyChange, finerDirection);
        insights.push({
            title: "Age compensation",
            text: `The grind setting trends ${direction} by ${Math.abs(weeklyChange).toFixed(2)} every 7 days—${move} on your grinder. This is a correlation across ${agePoints.length} shots, not a rule.`,
            tone: "amber"
        });
    } else {
        insights.push({
            title: "Age compensation",
            text: agePoints.length < 4 || ageSpan < 7
                ? "More shots across at least a week are needed to estimate grind drift."
                : "There is no clear grind-setting drift with bean age yet.",
            tone: "neutral"
        });
    }

    if (flowRegression && Math.abs(flowRegression.slope * 7) >= 0.03) {
        const weeklyFlow = flowRegression.slope * 7;
        insights.push({
            title: "Flow drift",
            text: `Flow trends ${weeklyFlow > 0 ? "faster" : "slower"} by ${Math.abs(weeklyFlow).toFixed(2)} g/s every 7 days. Watch this alongside grind changes to separate aging from recipe changes.`,
            tone: weeklyFlow > 0 ? "cyan" : "amber"
        });
    } else {
        insights.push({
            title: "Flow drift",
            text: usable.length >= 4 ? "Flow rate is fairly stable across the observed age range." : "Log more complete shots to measure flow drift.",
            tone: "neutral"
        });
    }

    insights.push({
        title: "Recipe consistency",
        text: usable.length
            ? `${dialedPercent}% of complete shots landed in the roast-level target. Ratio variation is ±${standardDeviation(ratios).toFixed(2)}.`
            : "Complete dose, yield, and time values will unlock consistency analysis.",
        tone: dialedPercent >= 60 ? "green" : "neutral"
    });

    if (bestWindow) {
        insights.push({
            title: "Best age window",
            text: `${bestWindow.label} has the strongest target rate: ${bestWindow.good} of ${bestWindow.total} shots.`,
            tone: "green"
        });
    }

    return {
        usable,
        agePoints,
        ageTrend: ageRegression ? { ...ageRegression, weeklyChange: ageRegression.slope * 7 } : null,
        flowTrend: flowRegression ? { ...flowRegression, weeklyChange: flowRegression.slope * 7 } : null,
        metrics: {
            shots: usable.length,
            dialedPercent,
            medianRatio: median(ratios),
            ageSpan
        },
        insights,
        isSingleBean
    };
};
