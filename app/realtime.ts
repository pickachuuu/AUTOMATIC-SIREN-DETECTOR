import type { AnalysisResult } from "./detector/types";

export const REALTIME_WINDOW_SECONDS = 4;
export const REALTIME_ANALYSIS_INTERVAL_MS = 1000;

export interface RealtimeEvent {
  id: string;
  timestamp: string;
  confidence: number;
  sweepScore: number;
  persistence: number;
}

export function appendRollingBuffer(
  existing: Float64Array,
  chunk: Float32Array | Float64Array,
  sampleRate: number,
  windowSeconds = REALTIME_WINDOW_SECONDS
) {
  const maxSamples = Math.max(1, Math.round(sampleRate * windowSeconds));
  const merged = new Float64Array(existing.length + chunk.length);
  merged.set(existing, 0);
  merged.set(chunk, existing.length);

  if (merged.length <= maxSamples) {
    return merged;
  }

  return merged.slice(merged.length - maxSamples);
}

export function createDetectionEvent(result: AnalysisResult, wasPreviouslyDetected: boolean, now = new Date()): RealtimeEvent | null {
  if (!result.detected || wasPreviouslyDetected) {
    return null;
  }

  return {
    id: `${now.getTime()}-${result.confidence}`,
    timestamp: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    confidence: result.confidence,
    sweepScore: result.sweepScore,
    persistence: result.persistence
  };
}
