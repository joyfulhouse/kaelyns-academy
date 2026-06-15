"use client";

/**
 * Audio-first helper. English prompts are voiced by the Kokoro neural voice via
 * the /api/tts route (see narrate); if that is unavailable we fall back to the
 * browser's built-in speech synthesis. Degrades silently where neither works.
 */
import { type NarrateHandle, narrate } from "./narrate";

export function canSpeak(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

/** Browser Web Speech delivery — the fallback when Kokoro is unavailable. */
function speakViaSynth(text: string): void {
  if (!canSpeak()) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.rate = 0.92;
    utterance.pitch = 1.05;
    utterance.lang = "en-US";
    synth.speak(utterance);
  } catch {
    // Speech is an enhancement; failure must never block the child.
  }
}

let active: NarrateHandle | null = null;

/** Speak a short phrase via Kokoro (fallback: browser TTS). Cancels anything in flight. */
export function speak(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  stopSpeaking();
  active = narrate(trimmed, {
    persist: "durable",
    onUnavailable: () => speakViaSynth(trimmed),
  });
}

/** Stop any in-flight narration (clip or utterance). */
export function stopSpeaking(): void {
  if (active) {
    active.cancel();
    active = null;
  }
  if (canSpeak()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // no-op
    }
  }
}
