import type { AnalysisResult } from "./detector/types";

export const REALTIME_WINDOW_SECONDS = 2.5;
export const REALTIME_ANALYSIS_INTERVAL_MS = 500;
export const REALTIME_MIN_RMS = 0.012;
export const REALTIME_CONFIDENCE_THRESHOLD = 0.8;
export const REALTIME_SWEEP_THRESHOLD = 0.5;
export const REALTIME_PERSISTENCE_THRESHOLD = 0.25;
export const REALTIME_REQUIRED_HITS = 3;
export const REALTIME_MIN_FREQ_SPAN_HZ = 520;
export const REALTIME_MIN_REVERSALS = 3;
export const REALTIME_MAX_JUMPY_RATIO = 0.35;

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

export function rmsLevel(samples: Float64Array) {
  if (samples.length === 0) {
    return 0;
  }

  let energy = 0;
  for (const sample of samples) {
    energy += sample * sample;
  }
  return Math.sqrt(energy / samples.length);
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * percentileValue;
  const base = Math.floor(position);
  const rest = position - base;
  return sorted[base + 1] === undefined ? sorted[base] : sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

export function realtimeSweepEvidence(result: AnalysisResult) {
  const activeFreq = Array.from(result.dominantFreq).filter((_freq, index) => result.active[index]);
  if (activeFreq.length < 12) {
    return {
      passes: false,
      freqSpan: 0,
      reversals: 0,
      jumpyRatio: 1
    };
  }

  const diffs = activeFreq.slice(1).map((freq, index) => freq - activeFreq[index]);
  const meaningful = diffs.filter((diff) => Math.abs(diff) > 18);
  let reversals = 0;
  for (let index = 1; index < meaningful.length; index += 1) {
    if (Math.sign(meaningful[index]) !== Math.sign(meaningful[index - 1])) {
      reversals += 1;
    }
  }

  const jumpy = diffs.filter((diff) => Math.abs(diff) > 180).length;
  const jumpyRatio = diffs.length > 0 ? jumpy / diffs.length : 1;
  const freqSpan = percentile(activeFreq, 0.95) - percentile(activeFreq, 0.05);

  return {
    passes:
      freqSpan >= REALTIME_MIN_FREQ_SPAN_HZ &&
      reversals >= REALTIME_MIN_REVERSALS &&
      jumpyRatio <= REALTIME_MAX_JUMPY_RATIO,
    freqSpan,
    reversals,
    jumpyRatio
  };
}

export function isRealtimeCandidate(result: AnalysisResult, rms: number) {
  const sweepEvidence = realtimeSweepEvidence(result);
  return (
    rms >= REALTIME_MIN_RMS &&
    result.detected &&
    result.confidence >= REALTIME_CONFIDENCE_THRESHOLD &&
    result.sweepScore >= REALTIME_SWEEP_THRESHOLD &&
    result.persistence >= REALTIME_PERSISTENCE_THRESHOLD &&
    sweepEvidence.passes
  );
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
