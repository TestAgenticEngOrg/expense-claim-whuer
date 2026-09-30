// The calendar week (Monday 00:00 local -> next Monday 00:00) an expense date
// falls in, used to sum "the employee's own claims already created this week"
// against the team's weekly limit — no endpoint supplies that sum, so it is
// computed client-side from GET /me/expense-claims (the issue's own guidance).

export interface WeekRange {
  start: Date;
  end: Date;
}

export function currentWeekRange(now: Date = new Date()): WeekRange {
  const day = now.getDay(); // 0 = Sunday
  const diffToMonday = (day + 6) % 7;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

export function isDateInRange(dateStr: string, range: WeekRange): boolean {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  return d >= range.start && d < range.end;
}
