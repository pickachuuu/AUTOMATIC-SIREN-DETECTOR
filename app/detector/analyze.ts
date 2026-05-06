import { bandpassFilter, extractFeatures } from "./dsp";
import { TARGET_SAMPLE_RATE, type AnalysisResult, type DetectionFeatures, type DetectionResult } from "./types";
import { decodeWav, resampleLinear } from "./wav";

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

function frameIntervals(active: boolean[], times: Float64Array): Array<[number, number]> {
  const intervals: Array<[number, number]> = [];
  let start: number | null = null;
  const frameStep = times.length > 1 ? times[1] - times[0] : 0;

  for (let index = 0; index < active.length; index += 1) {
    if (active[index] && start === null) {
      start = times[index];
    } else if (!active[index] && start !== null) {
      intervals.push([start, times[index - 1] + frameStep]);
      start = null;
    }
  }

  if (start !== null && times.length > 0) {
    intervals.push([start, times[times.length - 1] + frameStep]);
  }

  return intervals;
}

function scoreFeatures(features: DetectionFeatures): DetectionResult {
  const bandScore = Math.min(1, features.meanBandRatio / 0.4);
  const persistenceScore = Math.min(1, features.persistence / 0.25);
  const confidence = 0.35 * bandScore + 0.3 * persistenceScore + 0.35 * features.sweepScore;
  const detected = confidence >= 0.55 && features.persistence >= 0.15 && features.sweepScore >= 0.25;

  return {
    detected,
    confidence: round3(confidence),
    sirenBandEnergyRatio: round3(features.meanBandRatio),
    sweepScore: round3(features.sweepScore),
    persistence: round3(features.persistence),
    intervalsSeconds: frameIntervals(features.active, features.times).map(([start, end]) => [round3(start), round3(end)])
  };
}

function makeTimes(length: number, sampleRate: number) {
  const times = new Float64Array(length);
  for (let index = 0; index < length; index += 1) {
    times[index] = index / sampleRate;
  }
  return times;
}

export function analyzeWavBytes(bytes: ArrayBuffer | Uint8Array, filename = "audio.wav"): AnalysisResult {
  const decoded = decodeWav(bytes);
  const audio = resampleLinear(decoded, TARGET_SAMPLE_RATE);

  if (audio.samples.length < audio.sampleRate / 2) {
    throw new Error("Audio must be at least 0.5 seconds long.");
  }

  const features = extractFeatures(audio.samples, audio.sampleRate);
  const filtered = bandpassFilter(audio.samples, audio.sampleRate);
  const detection = scoreFeatures(features);

  return {
    ...detection,
    filename,
    sampleRate: audio.sampleRate,
    durationSeconds: audio.samples.length / audio.sampleRate,
    waveform: audio.samples,
    filteredWaveform: filtered,
    waveformTimes: makeTimes(audio.samples.length, audio.sampleRate),
    spectrogram: {
      frequencies: features.frequencies,
      times: features.times,
      magnitude: features.magnitude
    },
    dominantFreq: features.dominantFreq,
    active: features.active,
    bandRatioByFrame: features.bandRatioByFrame
  };
}

export function resultToJson(result: AnalysisResult) {
  return JSON.stringify(
    {
      detected: result.detected,
      confidence: result.confidence,
      siren_band_energy_ratio: result.sirenBandEnergyRatio,
      sweep_score: result.sweepScore,
      persistence: result.persistence,
      intervals_seconds: result.intervalsSeconds
    },
    null,
    2
  );
}
