/**
 * Years in AtLapse are whole numbers with no year 0: -1 is 1 BCE, 1 is 1 CE.
 * This is what lets the timeline reach far past what a database timestamp holds.
 */

export function isValidYear(year: number): boolean {
  return Number.isInteger(year) && year !== 0;
}

/** Number of years between two years, stepping over the missing year 0. */
export function yearDistance(a: number, b: number): number {
  const toLinear = (y: number) => (y < 0 ? y + 1 : y);
  return Math.abs(toLinear(a) - toLinear(b));
}

export function formatYear(year: number): string {
  if (!isValidYear(year)) throw new Error(`Invalid year: ${year}`);
  if (year < 0) return `${Math.abs(year).toLocaleString('en-GB')} BCE`;
  return year < 1000 ? `${year} CE` : String(year);
}

/** The year part of an ISO date such as 1937-04-26. */
export function yearFromIsoDate(isoDate: string): number {
  const match = /^(\d{4})-\d{2}-\d{2}/.exec(isoDate);
  if (!match) throw new Error(`Not an ISO date: ${isoDate}`);
  const year = Number(match[1]);
  if (year === 0) throw new Error('ISO year 0000 has no place on the AtLapse timeline');
  return year;
}
