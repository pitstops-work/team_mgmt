// Utility for auto-scheduling checklist item activities within a pitstop SLA window.
// All scheduling rules come from AppSetting rows — nothing is hardcoded.

export interface ScheduleConfig {
  travelWeekAnchor: Date; // A Monday known to be a travel week
  // cityName → { isTravelWeek, dayOfWeek (1=Mon…5=Fri) }
  meetingRules: Map<string, { isTravelWeek: boolean; dayOfWeek: number }>;
  defaultHour: number; // 0-23, hour to schedule activities (default 9)
}

// Returns the Monday of the week containing `date`
function weekMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0=Sun,1=Mon,...,6=Sat
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offset);
  return d;
}

export function isTravelWeek(date: Date, anchor: Date): boolean {
  const monday = weekMonday(date);
  const anchorMonday = weekMonday(anchor);
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksDiff = Math.round((monday.getTime() - anchorMonday.getTime()) / msPerWeek);
  // anchor is a travel week; even difference = travel, odd = non-travel
  return Math.abs(weeksDiff) % 2 === 0;
}

function isBlockedDay(date: Date, cityName: string | null, config: ScheduleConfig): boolean {
  if (!cityName) return false;
  const rule = config.meetingRules.get(cityName);
  if (!rule) return false;

  const jsDow = date.getDay(); // 0=Sun,1=Mon,...
  // rule.dayOfWeek is 1=Mon,2=Tue,... matching JS getDay() for Mon-Fri
  if (jsDow !== rule.dayOfWeek) return false;

  const travel = isTravelWeek(date, config.travelWeekAnchor);
  return rule.isTravelWeek === travel;
}

// Returns all valid working days (Mon-Fri, not blocked) in [start, end], at defaultHour.
export function getWorkingDays(
  start: Date,
  end: Date,
  cityName: string | null,
  config: ScheduleConfig,
): Date[] {
  const days: Date[] = [];
  const cur = new Date(start);
  cur.setHours(config.defaultHour, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(23, 59, 59, 999);

  while (cur <= endDay) {
    const dow = cur.getDay();
    if (dow >= 1 && dow <= 5 && !isBlockedDay(cur, cityName, config)) {
      days.push(new Date(cur));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// Simple weekend skip — moves Sat → Mon, Sun → Mon, weekday unchanged.
// Use for derived dates (template apply, recurring clone, cascade shifts) where we
// want to guarantee no Sat/Sun deadlines but don't have full city/travel-week
// schedule context loaded. For city-aware blocking use nearestWorkingDay.
export function snapToWeekday<T extends Date | null | undefined>(date: T): T {
  if (!date) return date;
  const d = new Date(date);
  const dow = d.getDay(); // 0 = Sun, 6 = Sat
  if (dow === 6) d.setDate(d.getDate() + 2);
  else if (dow === 0) d.setDate(d.getDate() + 1);
  return d as T;
}

// Nearest working day at or after `date` (skips weekends + blocked days).
// Used as fallback when SLA window has no working days.
export function nearestWorkingDay(
  date: Date,
  cityName: string | null,
  config: ScheduleConfig,
): Date {
  const d = new Date(date);
  d.setHours(config.defaultHour, 0, 0, 0);
  for (let i = 0; i < 14; i++) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5 && !isBlockedDay(d, cityName, config)) return d;
    d.setDate(d.getDate() + 1);
  }
  return d; // give up after 14 days
}

// Distributes `count` activities evenly across `days` by sequence index.
// If count > days, activities cycle through days.
// Returns one Date per activity (index 0 = first item in checklist sequence).
export function distributeAcrossDays(count: number, days: Date[]): Date[] {
  if (count === 0) return [];
  if (days.length === 0) return [];

  if (count <= days.length) {
    const interval = days.length / count;
    return Array.from({ length: count }, (_, i) =>
      days[Math.min(Math.floor(i * interval), days.length - 1)]
    );
  }

  // More items than days — cycle
  return Array.from({ length: count }, (_, i) => days[i % days.length]);
}

// Maps pitstop type string → PitstopEventType enum value
export function pitstopTypeToEventType(pitstopType: string): "Meeting" | "Visit" | "Event" {
  if (pitstopType === "SiteVisit" || pitstopType === "Research") return "Visit";
  if (pitstopType === "Meeting" || pitstopType === "Discussion" || pitstopType === "Review") return "Meeting";
  return "Event";
}

// Parse AppSetting rows into a ScheduleConfig.
// Expected keys:
//   "travelWeekAnchor"   → ISO date of a known travel week Monday (e.g. "2026-04-20")
//   "activityHour"       → integer 0-23 (default 9)
//   "meetingRule:<City>" → "<travel|non-travel>:<dayOfWeek 1-5>"
//     e.g. "meetingRule:Bangalore" → "non-travel:1"  (non-travel Mondays)
//          "meetingRule:Chennai"   → "travel:2"       (travel Tuesdays)
export function buildScheduleConfig(settings: { key: string; value: string }[]): ScheduleConfig {
  const map = new Map(settings.map(s => [s.key, s.value]));

  const anchorStr = map.get("travelWeekAnchor") ?? "2026-04-20";
  const travelWeekAnchor = new Date(anchorStr);

  const defaultHour = Number(map.get("activityHour") ?? "9");

  const meetingRules = new Map<string, { isTravelWeek: boolean; dayOfWeek: number }>();
  for (const [key, value] of map) {
    if (!key.startsWith("meetingRule:")) continue;
    const cityName = key.slice("meetingRule:".length);
    const [weekType, dayStr] = value.split(":");
    meetingRules.set(cityName, {
      isTravelWeek: weekType === "travel",
      dayOfWeek: Number(dayStr),
    });
  }

  return { travelWeekAnchor, meetingRules, defaultHour };
}
