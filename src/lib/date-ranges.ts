/** Collapses a sorted list of ISO 'yyyy-MM-dd' dates into contiguous [start, end] ranges. */
export function groupConsecutiveDates(dates: string[]): { start: string; end: string }[] {
  if (dates.length === 0) return [];
  const sorted = [...dates].sort();
  const ranges: { start: string; end: string }[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const prevDate = new Date(prev);
    const expectedNext = new Date(prevDate);
    expectedNext.setUTCDate(expectedNext.getUTCDate() + 1);
    const expectedStr = expectedNext.toISOString().slice(0, 10);

    if (current !== expectedStr) {
      ranges.push({ start, end: prev });
      start = current;
    }
    prev = current;
  }
  ranges.push({ start, end: prev });
  return ranges;
}
