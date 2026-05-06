import { describe, expect, it } from "vitest";
import { createDetectionEvent, appendRollingBuffer } from "../app/realtime";
import type { AnalysisResult } from "../app/detector/types";

function makeResult(detected: boolean): AnalysisResult {
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
    dominantFreq: new Float64Array(),
    active: [],
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
