export const TARGET_SAMPLE_RATE = 16_000;
export const SIREN_BAND = [500, 1800] as const;

export interface WavAudio {
  sampleRate: number;
  samples: Float64Array;
}

export interface DetectionResult {
  detected: boolean;
  confidence: number;
  sirenBandEnergyRatio: number;
  sweepScore: number;
  persistence: number;
  intervalsSeconds: Array<[number, number]>;
}

export interface Spectrogram {
  frequencies: Float64Array;
  times: Float64Array;
  magnitude: number[][];
}

export interface DetectionFeatures extends Spectrogram {
  bandRatioByFrame: Float64Array;
  dominantFreq: Float64Array;
  active: boolean[];
  meanBandRatio: number;
  persistence: number;
  sweepScore: number;
}

export interface AnalysisResult extends DetectionResult {
  filename: string;
  sampleRate: number;
  durationSeconds: number;
  waveform: Float64Array;
  filteredWaveform: Float64Array;
  waveformTimes: Float64Array;
  spectrogram: Spectrogram;
  dominantFreq: Float64Array;
  active: boolean[];
  bandRatioByFrame: Float64Array;
}
