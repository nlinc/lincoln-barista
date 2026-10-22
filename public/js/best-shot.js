import { normalizeRoastDate, recordTime } from "./bean-record.js?v=1.18.2";
import { bagBrewSetup } from "./brew-setup.js?v=1.18.2";
import { getBrewAdvice } from "./brew-advice.js?v=1.18.2";
import { recordMachineId } from "./machine-config.js?v=1.18.2";
import { validateShot } from "./shot-analytics.js?v=1.18.2";

export const chooseBestShot = (logs, roastLevel, targetRatio = 2) => {
    const complete = logs.filter(log => validateShot(log).valid)
        .sort((a, b) => recordTime(b.date) - recordTime(a.date));
    if (!complete.length) return null;
    const successful = complete.filter(log => !log.channelingObserved &&
        (log.taste === 'balanced' || (!log.taste && getBrewAdvice(log, roastLevel).status === 'good')));
    const ratioDistance = shot => Math.abs(Number(shot.yield) / Number(shot.dose) - targetRatio);
    successful.sort((a, b) => Number(b.taste === 'balanced') - Number(a.taste === 'balanced') ||
        Number(getBrewAdvice(b, roastLevel).status === 'good') - Number(getBrewAdvice(a, roastLevel).status === 'good') ||
        ratioDistance(a) - ratioDistance(b) || recordTime(b.date) - recordTime(a.date));
    return { shot: successful[0] || complete[0], status: successful.length ? 'Best' : 'Resume' };
};

export const bestShotFor = (bean, logs, machineId) => {
    if (!bean) return null;
    const setup = bagBrewSetup(bean, machineId);
    const scoped = logs.filter(shot => shot.beanId === bean.id && recordMachineId(shot) === machineId &&
        normalizeRoastDate(shot.roastDate) === normalizeRoastDate(bean.currentRoastDate) &&
        (!setup || (shot.basketId === setup.basketId && Math.abs(Number(shot.dose) - setup.dose) <= 1)));
    return chooseBestShot(scoped, bean.roastLevel, setup?.ratio || 2);
};

export const recipeWithBestGrind = (bean, logs, machineId, recipe) => {
    const best = bestShotFor(bean, logs, machineId);
    if (!best) return recipe;
    if (recipe?.status !== 'Saved') return { ...best, bestShotId: best.status === 'Best' ? best.shot.id : null };
    if (best.status !== 'Best' && recipe.shot.grind !== '') return recipe;
    return { ...recipe, bestShotId: best.status === 'Best' ? best.shot.id : null,
        shot: { ...recipe.shot, grind: String(best.shot.grind) } };
};
