export type AudioStatus = "idle" | "playing" | "completed" | "unavailable";

export interface AudioRequest {
  audioKey?: string;
  text: string;
}

export interface AudioPlaybackState {
  status: AudioStatus;
  requestId: number;
  lastRequest: AudioRequest | null;
}

export const initialAudioPlaybackState: AudioPlaybackState = {
  status: "idle",
  requestId: 0,
  lastRequest: null,
};

export type AudioPlaybackEvent =
  | { type: "play"; requestId: number; request: AudioRequest }
  | { type: "retry"; requestId: number }
  | { type: "finished"; requestId: number }
  | { type: "fallback"; requestId: number }
  | { type: "unavailable"; requestId: number }
  | { type: "cancelled"; requestId: number }
  | { type: "stop"; requestId: number };

/**
 * Small request-token state machine for the hybrid clip/TTS player. Async media
 * callbacks carry the request id that created them, so a late callback from the
 * previous lesson item cannot overwrite the current item's availability.
 */
export function audioPlaybackReducer(
  state: AudioPlaybackState,
  event: AudioPlaybackEvent,
): AudioPlaybackState {
  if (event.type === "play") {
    return {
      status: "playing",
      requestId: event.requestId,
      lastRequest: event.request,
    };
  }

  if (event.type === "retry") {
    if (!state.lastRequest) return state;
    return { ...state, status: "playing", requestId: event.requestId };
  }

  if (event.type === "stop") {
    return { ...state, status: "idle", requestId: event.requestId };
  }

  if (event.requestId !== state.requestId) return state;

  if (event.type === "finished") {
    return { ...state, status: "completed" };
  }
  if (event.type === "fallback") {
    return state;
  }
  if (event.type === "unavailable") {
    return { ...state, status: "unavailable" };
  }
  if (event.type === "cancelled") {
    return { ...state, status: "idle" };
  }
  return state;
}
