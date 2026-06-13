import type { ActivityKind, ActivityType } from "./types";

/** Type-erased view stored in the registry. Players re-validate config via
 *  their schema at the render boundary, so erasure here is safe. */
export type RegisteredActivityType = ActivityType<unknown, unknown>;

const registry = new Map<ActivityKind, RegisteredActivityType>();

export function registerActivityType<Config, Response>(
  activityType: ActivityType<Config, Response>,
): void {
  registry.set(activityType.kind, activityType as unknown as RegisteredActivityType);
}

export function getActivityType(kind: ActivityKind): RegisteredActivityType | undefined {
  return registry.get(kind);
}

export function allActivityTypes(): RegisteredActivityType[] {
  return [...registry.values()];
}

export function isActivityKindRegistered(kind: ActivityKind): boolean {
  return registry.has(kind);
}
