import { describe, expect, it } from "vitest";
import { explainRealtimeEvent, formatHighlightIntervals } from "../app/explanations";
import type { AnalysisResult } from "../app/detector/types";
import type { RealtimeEvent } from "../app/realtime";

function makeEvent(): RealtimeEvent {
  const analysis: AnalysisResult = {
    detected: true,
    confidence: 0.91,
    sirenBandEnergyRatio: 0.52,
    sweepScore: 0.77,
    persistence: 0.43,
    intervalsSeconds: [
      [0.4, 1.1],
      [1.3, 1.9],
      [2.1, 2.4],
      [2.5, 2.8]
    ],
    filename: "Live microphone",
    sampleRate: 16000,
    durationSeconds: 2.8,
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

  return {
    id: "event-1",
    timestamp: "12:00:00 PM",
    confidence: analysis.confidence,
    sweepScore: analysis.sweepScore,
    persistence: analysis.persistence,
    analysis,
    sweepEvidence: {
      passes: true,
      freqSpan: 640,
      reversals: 4,
      jumpyRatio: 0.12
    }
  };
}

describe("highlight interval formatting", () => {
  it("caps displayed intervals with a remaining count", () => {
    expect(formatHighlightIntervals(makeEvent().analysis.intervalsSeconds)).toBe("0.40s-1.10s, 1.30s-1.90s, 2.10s-2.40s +1 more");
  });

  it("returns none when no intervals exist", () => {
    expect(formatHighlightIntervals([])).toBe("none");
  });
});

describe("realtime event explanations", () => {
  it("uses event metrics in deterministic explanation text", () => {
    const explanation = explainRealtimeEvent(makeEvent());
    expect(explanation.summary).toContain("Confidence was 0.910");
    expect(explanation.bullets.join(" ")).toContain("640 Hz");
    expect(explanation.fact).toContain("STFT");
  });
});
