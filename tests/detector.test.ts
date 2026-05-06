import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeWavBytes } from "../app/detector/analyze";
import { computeSpectrogram, fftReal } from "../app/detector/dsp";
import { decodeWav, resampleLinear } from "../app/detector/wav";

const root = process.cwd();

function readFixture(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath));
}

describe("WAV decoding and resampling", () => {
  it("decodes bundled WAV audio as normalized mono samples", () => {
    const audio = decodeWav(readFixture("data/siren_clear.wav"));
    expect(audio.sampleRate).toBeGreaterThan(0);
    expect(audio.samples.length).toBeGreaterThan(audio.sampleRate);
    expect(Math.max(...audio.samples.slice(0, 2000))).toBeLessThanOrEqual(1);
  });

  it("resamples fixtures to the detector target rate", () => {
    const audio = decodeWav(readFixture("data/siren_clear.wav"));
    const resampled = resampleLinear(audio, 16_000);
    expect(resampled.sampleRate).toBe(16_000);
    expect(resampled.samples.length).toBeGreaterThan(8_000);
  });
});

describe("DSP primitives", () => {
  it("places a sine tone in the expected FFT bin", () => {
    const sampleRate = 1024;
    const toneBin = 8;
    const signal = new Float64Array(1024);
    for (let index = 0; index < signal.length; index += 1) {
      signal[index] = Math.sin((2 * Math.PI * toneBin * index) / sampleRate);
    }
    const spectrum = fftReal(signal);
    const magnitudes = spectrum.slice(0, 64).map((value) => Math.hypot(value.re, value.im));
    const peak = magnitudes.indexOf(Math.max(...magnitudes));
    expect(peak).toBe(toneBin);
  });

  it("computes STFT frames with positive frequency bins", () => {
    const audio = decodeWav(readFixture("data/siren_clear.wav"));
    const spectrogram = computeSpectrogram(audio.samples, audio.sampleRate);
    expect(spectrogram.times.length).toBeGreaterThan(0);
    expect(spectrogram.frequencies[0]).toBe(0);
    expect(spectrogram.frequencies.length).toBe(513);
  });
});

describe("siren detector parity on bundled manifest", () => {
  const cases = [
    ["data/siren_clear.wav", true],
    ["data/siren_traffic.wav", true],
    ["data/siren_low_volume.wav", true],
    ["data/traffic_noise.wav", false],
    ["data/speech_like.wav", false],
    ["data/music_like.wav", false],
    ["data/horn_like.wav", false]
  ] as const;

  it.each(cases)("%s -> detected=%s", (fixture, expected) => {
    const result = analyzeWavBytes(readFixture(fixture), path.basename(fixture));
    expect(result.detected).toBe(expected);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
