import type { TypingCatchConfig } from "@/content/activity-configs";
import {
  matchesTypingTarget,
  type TypingCharIntent,
} from "../_shared/typing/typingKey";
import {
  FALL_SECONDS,
  maxPrompts,
  roundDurationMs,
  spawnIntervalMs,
  type TypingCatchResponse,
} from "./logic";

/**
 * Star Catch's rules as pure, CLOCK-INJECTED functions — every timing case is
 * unit-testable without a DOM or a fake timer. The Player owns only the
 * interval that supplies `nowMs`.
 */
export interface CatchTarget {
  id: number;
  text: string;
  spawnedMs: number;
}

export interface CatchState {
  targets: CatchTarget[];
  nextId: number;
  lives: number;
  results: TypingCatchResponse["prompts"];
  lastSpawnMs: number;
  poolCursor: number;
}

const DEFAULT_LIVES = 3;
const DEFAULT_SPEED = "gentle";
const DEFAULT_DURATION_SEC = 45;

/** How long a star spends in the sky before it reaches the ground. */
export function fallMs(config: TypingCatchConfig): number {
  return FALL_SECONDS[config.speed ?? DEFAULT_SPEED] * 1_000;
}

/**
 * The pool cycles in authored order rather than at random: a child gets every
 * key the same number of times, and a spec can assert what falls next.
 */
function spawn(state: CatchState, config: TypingCatchConfig, nowMs: number): CatchState {
  const text = config.pool[state.poolCursor % config.pool.length] ?? config.pool[0]!;
  return {
    ...state,
    targets: [...state.targets, { id: state.nextId, text, spawnedMs: nowMs }],
    nextId: state.nextId + 1,
    lastSpawnMs: nowMs,
    poolCursor: state.poolCursor + 1,
  };
}

export function initialCatchState(config: TypingCatchConfig, nowMs: number): CatchState {
  const empty: CatchState = {
    targets: [],
    nextId: 0,
    lives: config.lives ?? DEFAULT_LIVES,
    results: [],
    lastSpawnMs: nowMs,
    poolCursor: 0,
  };
  return spawn(empty, config, nowMs);
}

/**
 * Land whatever has run out of sky, then spawn if the interval has elapsed.
 *
 * The boundary is strict: a star spawned exactly `fallMs` ago is still in the
 * air on its last frame. It lands on the next tick, which is what the child
 * sees — the sprite is still drawn at the ground line, not gone.
 */
export function tick(
  state: CatchState,
  config: TypingCatchConfig,
  nowMs: number,
): CatchState {
  const deadline = nowMs - fallMs(config);
  const landed = state.targets.filter((target) => target.spawnedMs < deadline);
  let next: CatchState = {
    ...state,
    targets: state.targets.filter((target) => target.spawnedMs >= deadline),
    lives: Math.max(0, state.lives - landed.length),
    results: [
      ...state.results,
      ...landed.map((target) => ({ text: target.text, ok: false, ms: fallMs(config) })),
    ],
  };
  if (
    nowMs < roundDurationMs(config) &&
    next.poolCursor < maxPrompts(config) &&
    nowMs - next.lastSpawnMs >= spawnIntervalMs(config)
  ) {
    next = spawn(next, config, nowMs);
  }
  return next;
}

/**
 * A wrong key costs nothing at all. Only a star reaching the ground dims a
 * heart — hunting for a key must never be punished, just untimely.
 *
 * `Array.find` returns the first element and `targets` is append-ordered, so
 * the OLDEST match pops when two of the same letter share the sky.
 */
export function typeChar(
  state: CatchState,
  config: TypingCatchConfig,
  intent: TypingCharIntent,
  nowMs: number,
): CatchState {
  const hit = state.targets.find((target) => matchesTypingTarget(target.text, intent));
  if (!hit) return state;
  return {
    ...state,
    targets: state.targets.filter((target) => target.id !== hit.id),
    results: [...state.results, { text: hit.text, ok: true, ms: nowMs - hit.spawnedMs }],
  };
}

/**
 * Resolve every star still in the sky on either ending. Omitting those targets
 * would make a spawned star count against accuracy only when it happened to
 * land a frame earlier, inflating both timed and hearts-out scores.
 */
export function resolveAirborne(state: CatchState, elapsedMs: number): CatchState {
  if (state.targets.length === 0) return state;
  return {
    ...state,
    targets: [],
    results: [
      ...state.results,
      ...state.targets.map((target) => ({
        text: target.text,
        ok: false,
        ms: Math.max(0, elapsedMs - target.spawnedMs),
      })),
    ],
  };
}

/** Both visibility and focus must agree that the child can see the round. */
export function roundIsPaused(documentHidden: boolean, windowFocused: boolean): boolean {
  return documentHidden || !windowFocused;
}

export function roundOver(
  state: CatchState,
  config: TypingCatchConfig,
  elapsedMs: number,
): "time" | "lives" | null {
  if (state.lives <= 0) return "lives";
  if (elapsedMs >= (config.durationSec ?? DEFAULT_DURATION_SEC) * 1_000) return "time";
  return null;
}
