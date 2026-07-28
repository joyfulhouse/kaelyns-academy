/**
 * The typing gate, as a pure decision. Typing is the one place in the product
 * that requires a physical keyboard (spec: the sole exception to touch-first
 * design), so a tablet gets an explanation rather than a broken game.
 *
 * "blocked" is a message, not a dead end — the stage keeps listening for a
 * keypress, so an iPad with a keyboard case opens the moment a key is pressed.
 */
export type GateState = "blocked" | "prove" | "open";

/** The home-row anchor doubles as the proof-of-keyboard key. */
export const PROVE_KEY = "f";

export function gateState(input: {
  coarsePointerOnly: boolean;
  keyboardProven: boolean;
}): GateState {
  if (input.keyboardProven) return "open";
  return input.coarsePointerOnly ? "blocked" : "prove";
}
