/** Keep visible and spoken verification wording aligned unless content opts out explicitly. */
export function spokenVerifications<T extends { prompt: string; spokenPrompt?: string }>(
  checks: T[],
): Array<T & { spokenPrompt: string }> {
  return checks.map((check) => ({
    ...check,
    spokenPrompt: check.spokenPrompt ?? check.prompt,
  }));
}
