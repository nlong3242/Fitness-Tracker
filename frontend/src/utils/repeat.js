/* A workout's repeating plan: weekly on some days (weekdays: bit 0 = Monday ...
   bit 6 = Sunday) or every N days from startDate. */

export const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function localDate(iso) {
    return new Date(`${iso}T12:00:00`);
}

function localIso(d) {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
}

// Index into WEEKDAY_NAMES of a yyyy-mm-dd date.
export function weekdayIndex(iso) {
    return (localDate(iso).getDay() + 6) % 7;
}

// The first day a rule plans, or null if none falls before its end date.
export function firstRepeatDay({ weekdays, startDate, endDate }) {
    let first = startDate;
    if (weekdays) {
        const d = localDate(startDate);
        while (!(weekdays & (1 << weekdayIndex(localIso(d))))) d.setDate(d.getDate() + 1);
        first = localIso(d);
    }
    return endDate && first > endDate ? null : first;
}

// "from 3 Nov" while a rule hasn't started, then "until 20 Dec" if it ends.
export function repeatDates({ startDate, endDate }, todayIso) {
    const short = iso => localDate(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return [
        startDate > todayIso ? `from ${short(startDate)}` : "",
        endDate ? `until ${short(endDate)}` : ""
    ].filter(Boolean).join(" ");
}

// "Mon, Thu", "Every day", "Every 3 days".
export function repeatLabel({ weekdays, everyDays }) {
    if (weekdays === 127 || everyDays === 1) return "Every day";
    if (everyDays) return `Every ${everyDays} days`;
    return WEEKDAY_NAMES.filter((_, i) => weekdays & (1 << i)).join(", ");
}
