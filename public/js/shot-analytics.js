import { getBrewAdvice } from "./brew-advice.js?v=1.18.0";
import { basketFor } from "./brew-setup.js?v=1.18.0";
import { recordMachineId } from "./machine-config.js?v=1.18.0";

const DAY_MS = 86400000;

const toNumber = (value) => {
    if (value === null || value === undefined || typeof value === 'boolean' || String(value).trim() === '') return null;
    const number = Number(value);
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
    const fieldErrors = {};

    if (grind === null) fieldErrors.grind = "Enter a valid grind setting.";
    if (time === null || time <= 0) fieldErrors.time = "Time must be greater than zero.";
    if (dose === null || dose <= 0) fieldErrors.dose = "Dose must be greater than zero.";
    if (yieldValue === null || yieldValue <= 0) fieldErrors.yield = "Yield must be greater than zero.";
    const errors = Object.values(fieldErrors);

    return {
        valid: errors.length === 0,
        errors,
        fieldErrors,
        values: { grind, time, dose, yield: yieldValue }
    };
};

export const summarizeGrindFrequency = (shots) => {
    const counts = new Map();
    shots.forEach(shot => {
        const grind = toNumber(shot?.grind);
        if (grind === null) return;
        counts.set(grind, (counts.get(grind) || 0) + 1);
    });
    return [...counts.entries()]
        .sort(([grindA], [grindB]) => grindA - grindB)
        .map(([grind, count]) => ({ label: String(grind), grind, count }));
};

export const filterShotTrends = (logs, beans, { machineId, basketId = 'all', roast = 'all' }) => {
    const beanLookup = new Map(beans.map(bean => [bean.id, bean]));
    return logs.filter(log => recordMachineId(log) === machineId &&
        (basketId === 'all' || (basketId === 'unknown' ? !basketFor(log.basketId, machineId) : log.basketId === basketId)) &&
        (roast === 'all' || beanLookup.get(log.beanId)?.roastLevel?.toLowerCase() === roast));
};

export const summarizeBasketResults = (logs, beans) => {
    const groups = new Map();
    for (const shot of summarizeShotPatterns(logs, beans).usable) {
        const basket = basketFor(shot.basketId, recordMachineId(shot));
        const id = basket?.id || 'unknown';
        if (!groups.has(id)) groups.set(id, { id, label: basket?.name || 'Not recorded', shots: [] });
        groups.get(id).shots.push(shot);
    }
    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label)).map(({ id, label, shots }) => ({
        id, label, count: shots.length,
        grind: median(shots.map(shot => shot.grind)),
        dose: median(shots.map(shot => shot.dose)),
        yield: median(shots.map(shot => shot.yield)),
        time: median(shots.map(shot => shot.time)),
        ratio: median(shots.map(shot => shot.ratio)),
        balanced: shots.filter(shot => shot.taste === 'balanced' && shot.channelingObserved !== true).length
    }));
};

export const recommendStartingGrind = ({ logs, beans, bean, machineId, basketId, dose, ratio, now = new Date() }) => {
    if (!bean || !basketFor(basketId, machineId) || toNumber(dose) === null || toNumber(ratio) === null) return null;
    const roast = String(bean.roastLevel || '').toLowerCase();
    if (!['light', 'medium', 'dark', 'espresso'].includes(roast)) return null;
    const candidates = summarizeShotPatterns(filterShotTrends(logs, beans, { machineId, basketId, roast }), beans).usable
        .filter(shot => shot.shotDate <= now && now - shot.shotDate <= 90 * DAY_MS &&
            Math.abs(shot.dose - Number(dose)) <= 1 && Math.abs(shot.ratio - Number(ratio)) <= 0.25 &&
            shot.channelingObserved !== true &&
            (shot.taste === 'balanced' || (!shot.taste && shot.status === 'good')));
    const sameBean = candidates.filter(shot => shot.beanId === bean.id);
    const scope = sameBean.length >= 3 ? 'bean' : 'roast';
    const matches = (scope === 'bean' ? sameBean : candidates).slice(-20);
    if (scope === 'roast' && (matches.length < 5 || new Set(matches.map(shot => shot.beanId)).size < 2)) return null;
    return {
        grind: Math.round(median(matches.map(shot => shot.grind)) * 100) / 100,
        count: matches.length, scope, roast,
        min: Math.min(...matches.map(shot => shot.grind)),
        max: Math.max(...matches.map(shot => shot.grind))
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
        const key = JSON.stringify([shot.beanId, recordMachineId(shot), shot.basketId || 'unknown']);
        if (!baselines.has(key)) baselines.set(key, shot.grind);
        shot.grindDelta = shot.grind - baselines.get(key);
        shot.grindMovement = shot.grindDelta === 0 ? 0 : (finerDirection === "higher" ? shot.grindDelta : -shot.grindDelta);
    });

    const agePoints = usable
        .filter(shot => shot.age !== null)
        .map(shot => ({
            x: shot.age,
            y: isSingleBean ? shot.grind : shot.grindMovement,
            beanId: shot.beanId,
            label: shot.bean.name || "Bean"
        }));
    const flowPoints = usable
        .filter(shot => shot.age !== null)
        .map(shot => ({ x: shot.age, y: shot.flow }));
    const ageSpan = agePoints.length
        ? Math.max(...agePoints.map(point => point.x)) - Math.min(...agePoints.map(point => point.x))
        : 0;
    const hasMultipleBaskets = new Set(usable.map(shot => shot.basketId || 'unknown')).size > 1;
    const ageRegression = !hasMultipleBaskets && agePoints.length >= 4 && ageSpan >= 7 ? regression(agePoints) : null;
    const flowRegression = !hasMultipleBaskets && flowPoints.length >= 4 && ageSpan >= 7 ? regression(flowPoints) : null;
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
        const move = isSingleBean ? grinderMove(weeklyChange, finerDirection) : (weeklyChange > 0 ? "finer" : "coarser");
        insights.push({
            title: "Age compensation",
            text: isSingleBean
                ? `The grind setting trends ${direction} by ${Math.abs(weeklyChange).toFixed(2)} every 7 days—${move} on your grinder. Use that as a starting adjustment, then dial by taste.`
                : `Across beans, you typically move ${Math.abs(weeklyChange).toFixed(2)} ${move} every 7 days. Use that as a starting adjustment, then dial by taste.`,
            tone: "amber"
        });
    } else {
        insights.push({
            title: "Age compensation",
            text: hasMultipleBaskets ? 'Select one basket to estimate grind drift with bean age.' : agePoints.length < 4 || ageSpan < 7
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
            text: hasMultipleBaskets ? 'Select one basket to estimate flow drift with bean age.' : usable.length >= 4 ? "Flow rate is fairly stable across the observed age range." : "Log more complete shots to measure flow drift.",
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
        isSingleBean,
        hasMultipleBaskets
    };
};
