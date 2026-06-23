// All ET conversions go through Intl with timeZone America/New_York so DST is
// handled automatically (no manual offset math).

export function getEtParts(now: Date = new Date()): { hour: number; date: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  // Intl can emit "24" for midnight in some runtimes; normalize to 0.
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0;
  return { hour, date: `${year}-${month}-${day}` };
}

export function isNineEtHour(now: Date = new Date()): boolean {
  return getEtParts(now).hour === 9;
}

export function finnhubDateRange(now: Date = new Date()): { from: string; to: string } {
  const { date } = getEtParts(now);
  const to = date;
  const [y, m, d] = date.split("-").map((v) => parseInt(v, 10));
  // Build the ET calendar date at noon UTC to avoid edge rollovers, then subtract 2 days.
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() - 2);
  const from = `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(
    base.getUTCDate(),
  ).padStart(2, "0")}`;
  return { from, to };
}
