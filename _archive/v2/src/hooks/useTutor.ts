'use client';

import { useState, useRef, useCallback } from 'react';
import type { TutorRequest, TutorResponse } from '@/types';

const FALLBACK_MESSAGE = 'Keep going, you are doing great!';

export function useTutor() {
  const [messages, setMessages] = useState<TutorResponse[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  const speak = useCallback(
    async (text: string): Promise<void> => {
      cleanupAudio();
      setSpeaking(true);

      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });

        if (!res.ok) {
          throw new Error(`TTS request failed with status ${res.status}`);
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;

        await new Promise<void>((resolve, reject) => {
          audio.onended = () => {
            setSpeaking(false);
            resolve();
          };
          audio.onerror = () => {
            setSpeaking(false);
            reject(new Error('Audio playback failed'));
          };
          void audio.play().catch((err: unknown) => {
            setSpeaking(false);
            reject(err instanceof Error ? err : new Error('Audio play failed'));
          });
        });
      } catch {
        setSpeaking(false);
      }
    },
    [cleanupAudio],
  );

  const ask = useCallback(
    async (req: TutorRequest): Promise<string> => {
      let text: string;

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req),
        });

        if (!res.ok) {
          throw new Error(`Chat request failed with status ${res.status}`);
        }

        const data: { text: string } = await res.json();
        text = data.text;
      } catch {
        text = FALLBACK_MESSAGE;
      }

      const response: TutorResponse = { text };
      setMessages((prev) => [...prev, response]);

      // Speak the response (fire and forget, don't crash on failure)
      speak(text).catch(() => {
        // TTS failure is non-critical
      });

      return text;
    },
    [speak],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    speaking,
    ask,
    speak,
    clearMessages,
  };
}
