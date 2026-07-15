export const CLOCK_CYCLE_MINUTES = 12 * 60;
export const HALF_HOUR_MINUTES = 30;

export type ClockHand = "hour" | "minute";

export interface ClockBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ClockTime {
  hour: number;
  minute: 0 | 30;
}

/** Snap to one of the twenty-four half-hours in a twelve-hour cycle. */
export function normalizeHalfHour(totalMinutes: number): number {
  const snapped = Math.round(totalMinutes / HALF_HOUR_MINUTES) * HALF_HOUR_MINUTES;
  return ((snapped % CLOCK_CYCLE_MINUTES) + CLOCK_CYCLE_MINUTES) % CLOCK_CYCLE_MINUTES;
}

export function timeFromTotalMinutes(totalMinutes: number): ClockTime {
  const normalized = normalizeHalfHour(totalMinutes);
  const hourInCycle = Math.floor(normalized / 60);
  return {
    hour: hourInCycle === 0 ? 12 : hourInCycle,
    minute: (normalized % 60) as 0 | 30,
  };
}

export function anglesForTime(totalMinutes: number): {
  minuteAngle: number;
  hourAngle: number;
} {
  const normalized = normalizeHalfHour(totalMinutes);
  const { minute } = timeFromTotalMinutes(normalized);
  return {
    minuteAngle: minute * 6,
    hourAngle: normalized / 2,
  };
}

/** Clockwise degrees from twelve o'clock for a pointer inside an SVG box. */
export function pointerAngle(
  clientX: number,
  clientY: number,
  bounds: ClockBounds,
): number {
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const degrees = (Math.atan2(clientX - centerX, centerY - clientY) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

/** Choose the equivalent next angle nearest the prior unwrapped pointer angle. */
export function unwrapAngle(previousUnwrappedAngle: number, nextWrappedAngle: number): number {
  const previousWrapped =
    ((previousUnwrappedAngle % 360) + 360) % 360;
  let delta = nextWrappedAngle - previousWrapped;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return previousUnwrappedAngle + delta;
}

/**
 * Convert a hand drag delta into the one canonical clock value. A minute-hand
 * revolution advances one hour; an hour-hand revolution advances twelve.
 */
export function snapPointerToHalfHour(
  startTotalMinutes: number,
  pointerDeltaDegrees: number,
  hand: ClockHand,
): number {
  const minutesPerDegree = hand === "minute" ? 1 / 6 : 2;
  return normalizeHalfHour(startTotalMinutes + pointerDeltaDegrees * minutesPerDegree);
}
