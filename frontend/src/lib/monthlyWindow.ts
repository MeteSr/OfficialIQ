// The monthly exam opens for the last five days of each month (UTC).

export const MONTHLY_QUIZ_QUESTIONS = 50;

export function monthKeyUTC(d: Date): number {
  return d.getUTCFullYear() * 100 + (d.getUTCMonth() + 1);
}

export function daysInMonthUTC(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

export function isInLastFiveDaysOfMonth(d: Date): boolean {
  return d.getUTCDate() >= daysInMonthUTC(d) - 4;
}

/** Days the monthly window stays open, counting today: 5 on its first day, 1 on the last. */
export function monthlyWindowDaysLeft(d: Date): number {
  return daysInMonthUTC(d) - d.getUTCDate() + 1;
}
