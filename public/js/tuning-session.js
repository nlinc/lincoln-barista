export const tuningBeans = (beans) => beans.filter(bean => !bean.archived);

export const latestTuningShot = (logs, beanId, machineId) =>
    logs.find(log => log.beanId === beanId && (log.machineId || "elizabeth") === machineId) || null;

export const tuningRoast = (bean) => {
    const roast = String(bean?.roastLevel || "medium").toLowerCase();
    return ["light", "medium", "dark"].includes(roast) ? roast : "medium";
};
