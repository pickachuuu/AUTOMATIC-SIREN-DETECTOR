import { describe, expect, it } from "vitest";
import { appendRollingBuffer, createDetectionEvent, isRealtimeCandidate, realtimeSweepEvidence, rmsLevel } from "../app/realtime";
import type { AnalysisResult } from "../app/detector/types";

function makeResult(detected: boolean): AnalysisResult {
  const dominantFreq = new Float64Array([
    620, 760, 900, 1040, 1180, 1320, 1460, 1600, 1460, 1320, 1180, 1040, 900, 760, 620, 760, 900, 1040, 1180,
    1320, 1460, 1600, 1450, 1300, 1150, 1000
  ]);
  return {
    detected,
    confidence: detected ? 0.82 : 0.2,
    sirenBandEnergyRatio: 0.4,
    sweepScore: detected ? 0.7 : 0.1,
    persistence: detected ? 0.4 : 0.05,
    intervalsSeconds: detected ? [[0.5, 2.5]] : [],
    filename: "Live microphone",
    sampleRate: 16000,
    durationSeconds: 4,
    waveform: new Float64Array(),
    filteredWaveform: new Float64Array(),
    waveformTimes: new Float64Array(),
    spectrogram: {
      frequencies: new Float64Array(),
      times: new Float64Array(),
      magnitude: []
    },
    dominantFreq,
    active: Array.from({ length: dominantFreq.length }, () => detected),
    bandRatioByFrame: new Float64Array()
  };
}

describe("realtime rolling buffer", () => {
  it("appends audio chunks while preserving recent samples", () => {
    const existing = new Float64Array([1, 2, 3]);
    const chunk = new Float64Array([4, 5]);
    const result = appendRollingBuffer(existing, chunk, 10, 1);
    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
  });

  it("trims to the configured window length", () => {
    const existing = new Float64Array([1, 2, 3, 4, 5]);
    const chunk = new Float64Array([6, 7, 8]);
    const result = appendRollingBuffer(existing, chunk, 4, 1);
    expect(Array.from(result)).toEqual([5, 6, 7, 8]);
  });
});

describe("realtime detection events", () => {
  it("creates an event on a new detection", () => {
    const event = createDetectionEvent(makeResult(true), false, new Date("2026-05-06T12:00:00"));
    expect(event).toMatchObject({
      confidence: 0.82,
      sweepScore: 0.7,
      persistence: 0.4
    });
  });

  it("does not create repeated events while detection remains active", () => {
    expect(createDetectionEvent(makeResult(true), true)).toBeNull();
  });

  it("does not create events for clear audio", () => {
    expect(createDetectionEvent(makeResult(false), false)).toBeNull();
  });
});

describe("realtime candidate gating", () => {
  it("measures RMS level before detector normalization", () => {
    expect(rmsLevel(new Float64Array([0, 0.5, -0.5]))).toBeCloseTo(0.408, 2);
  });

  it("rejects quiet windows even if the normalized detector says yes", () => {
    expect(isRealtimeCandidate(makeResult(true), 0.001)).toBe(false);
  });

  it("accepts strong sustained siren-like evidence", () => {
    const result = makeResult(true);
    result.confidence = 0.86;
    result.sweepScore = 0.58;
    result.persistence = 0.32;
    expect(isRealtimeCandidate(result, 0.05)).toBe(true);
  });

  it("rejects weak live detections that pass the file detector", () => {
    const result = makeResult(true);
    result.confidence = 0.76;
    result.sweepScore = 0.46;
    result.persistence = 0.23;
    expect(isRealtimeCandidate(result, 0.05)).toBe(false);
  });

  it("rejects narrow fan-like tones even with high confidence", () => {
    const result = makeResult(true);
    result.confidence = 0.9;
    result.sweepScore = 0.7;
    result.persistence = 0.4;
    result.dominantFreq = new Float64Array([700, 705, 710, 706, 708, 704, 709, 711, 706, 708, 710, 709, 707]);
    result.active = Array.from({ length: result.dominantFreq.length }, () => true);
    expect(realtimeSweepEvidence(result).passes).toBe(false);
    expect(isRealtimeCandidate(result, 0.05)).toBe(false);
  });

  it("rejects jumpy speech-like tracks", () => {
    const result = makeResult(true);
    result.confidence = 0.9;
    result.sweepScore = 0.7;
    result.persistence = 0.4;
    result.dominantFreq = new Float64Array([600, 1550, 720, 1680, 790, 1490, 620, 1700, 810, 1420, 650, 1600, 710]);
    result.active = Array.from({ length: result.dominantFreq.length }, () => true);
    expect(realtimeSweepEvidence(result).passes).toBe(false);
    expect(isRealtimeCandidate(result, 0.05)).toBe(false);
  });
});
