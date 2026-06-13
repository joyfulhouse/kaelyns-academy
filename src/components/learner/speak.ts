"use client";

/**
 * Audio-first helper. The kid surface leads with the ear: prompts are read
 * aloud via the browser's built-in speech synthesis (no dependency, no network,
 * no child data leaves the device). Degrades silently where unavailable.
 *
 * TODO: a later phase may swap this for pre-recorded narration or a server TTS
 * route; keep `speak()` / `canSpeak()` as the stable seam.
 */

export function canSpeak(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

/** Speak a short phrase. Cancels anything already speaking so taps feel instant. */
export function speak(text: string): void {
  if (!canSpeak()) return;
  const trimmed = text.trim();
  if (!trimmed) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new window.SpeechSynthesisUtterance(trimmed);
    // Gentle, unhurried delivery to match the picture-book voice.
    utterance.rate = 0.92;
    utterance.pitch = 1.05;
    utterance.lang = "en-US";
    synth.speak(utterance);
  } catch {
    // Speech is an enhancement; failure must never block the child.
  }
}

/** Stop any in-flight narration (e.g. on unmount or navigation). */
export function stopSpeaking(): void {
  if (!canSpeak()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // no-op
  }
}
