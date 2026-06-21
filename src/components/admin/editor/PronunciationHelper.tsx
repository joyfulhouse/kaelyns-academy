"use client";

import { useState } from "react";
import { SpeakerHighIcon, PlusIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { cn } from "@/lib/cn";

interface PronunciationHelperProps {
  /** Insert the `[label](/IPA/)` token into the caller's field. */
  onInsert: (token: string) => void;
}

/**
 * Inline pronunciation override helper. Lets an author author a
 * `[label](/IPA/)` override token for any spoken field:
 *
 *   1. Type the display label and the IPA pronunciation.
 *   2. Click "Preview" — POSTs `[label](/IPA/)` to `/api/tts` and plays back.
 *   3. Click "Insert" to append the token to the target field.
 *
 * Consumes `/api/tts` read-only; no TTS-pipeline files are imported here.
 */
export function PronunciationHelper({ onInsert }: PronunciationHelperProps) {
  const [label, setLabel] = useState("");
  const [ipa, setIpa] = useState("");
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = label && ipa ? `[${label}](/${ipa}/)` : "";

  async function handlePreview() {
    if (!token) return;
    setError(null);
    setPlaying(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: token }),
      });
      if (!res.ok) {
        setError(res.status === 503 ? "TTS unavailable — try again." : "Preview failed.");
        return;
      }
      // Follow 303 redirect or stream the mp3 directly.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); setPlaying(false); };
      audio.onerror = () => { URL.revokeObjectURL(url); setPlaying(false); setError("Playback failed."); };
      await audio.play();
    } catch {
      setError("Preview failed. Check TTS is running.");
      setPlaying(false);
    }
  }

  function handleInsert() {
    if (!token) return;
    onInsert(token);
    setLabel("");
    setIpa("");
    setError(null);
  }

  return (
    <div className="rounded-lg border border-dashed border-line bg-paper-sunk p-4">
      <p className="mb-3 text-xs font-semibold text-ink-soft">
        Pronunciation helper — insert <code className="rounded bg-paper-raised px-1 py-0.5 font-mono text-ink">[label](/IPA/)</code> override
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink-soft">Display label</label>
          <TextInput
            value={label}
            onChange={(e) => { setLabel(e.target.value); }}
            placeholder="e.g. ㄅ"
            className="w-32 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink-soft">IPA pronunciation</label>
          <TextInput
            value={ipa}
            onChange={(e) => { setIpa(e.target.value); }}
            placeholder="e.g. p̪"
            className="w-40 text-sm font-mono"
          />
        </div>

        <Button
          type="button"
          variant="soft"
          size="sm"
          onClick={() => { void handlePreview(); }}
          disabled={!token || playing}
          className={cn(playing ? "opacity-70" : "")}
        >
          <SpeakerHighIcon weight="regular" className="size-4" />
          {playing ? "Playing…" : "Preview"}
        </Button>

        <Button
          type="button"
          variant="soft"
          size="sm"
          onClick={handleInsert}
          disabled={!token}
        >
          <PlusIcon weight="bold" className="size-4" />
          Insert
        </Button>
      </div>

      {token && (
        <p className="mt-2 font-mono text-xs text-ink-soft">
          Token: <span className="text-ink">{token}</span>
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-danger"
        >
          <WarningCircleIcon weight="regular" className="size-3.5" />
          {error}
        </p>
      )}
    </div>
  );
}
