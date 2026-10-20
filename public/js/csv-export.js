import { basketFor } from "./brew-setup.js?v=1.18.1";
import { recordMachineId } from "./machine-config.js?v=1.18.1";

export const csvText = (rows) => rows.map(row => row.map(value => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}).join(",")).join("\n");

export const shotExportRow = (log, bean, formattedDate, temperatureUnit = "F") => [
    formattedDate,
    recordMachineId(log),
    bean.name || log.beanId,
    bean.roaster || "",
    log.roastDate || "",
    log.grind,
    log.time,
    log.dose,
    log.yield,
    log.profileUsed || "",
    log.taste || "",
    log.brewTemperature ?? "",
    log.temperatureUnit || temperatureUnit || "F",
    log.pressureObserved ?? "",
    log.firstDropSeconds ?? "",
    log.channelingObserved === true,
    basketFor(log.basketId, recordMachineId(log))?.name || "",
    log.tampForceLb ?? ""
];
