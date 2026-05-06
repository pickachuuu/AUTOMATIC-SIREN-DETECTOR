import { SIREN_BAND, type DetectionFeatures, type Spectrogram } from "./types";

interface Complex {
  re: number;
  im: number;
}

function bitReverse(value: number, bits: number) {
  let reversed = 0;
  for (let index = 0; index < bits; index += 1) {
    reversed = (reversed << 1) | (value & 1);
    value >>= 1;
  }
  return reversed;
}

export function fftReal(input: Float64Array): Complex[] {
  const size = input.length;
  if (size <= 1 || (size & (size - 1)) !== 0) {
    throw new Error("FFT size must be a power of two.");
  }

  const bits = Math.log2(size);
  const output: Complex[] = Array.from({ length: size }, () => ({ re: 0, im: 0 }));
  for (let index = 0; index < size; index += 1) {
    output[bitReverse(index, bits)] = { re: input[index], im: 0 };
  }

  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const step = { re: Math.cos(angle), im: Math.sin(angle) };
    for (let start = 0; start < size; start += length) {
      let twiddle = { re: 1, im: 0 };
      for (let index = 0; index < length / 2; index += 1) {
        const even = output[start + index];
        const odd = output[start + index + length / 2];
        const rotated = {
          re: twiddle.re * odd.re - twiddle.im * odd.im,
          im: twiddle.re * odd.im + twiddle.im * odd.re
        };
        output[start + index] = { re: even.re + rotated.re, im: even.im + rotated.im };
        output[start + index + length / 2] = { re: even.re - rotated.re, im: even.im - rotated.im };
        twiddle = {
          re: twiddle.re * step.re - twiddle.im * step.im,
          im: twiddle.re * step.im + twiddle.im * step.re
        };
      }
    }
  }

  return output;
}

function hannWindow(size: number) {
  const window = new Float64Array(size);
  for (let index = 0; index < size; index += 1) {
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (size - 1));
  }
  return window;
}

export function computeSpectrogram(audio: Float64Array, sampleRate: number, nperseg = 1024, hop = 512): Spectrogram {
  const frameCount = audio.length >= nperseg ? Math.floor((audio.length - nperseg) / hop) + 1 : 0;
  const binCount = nperseg / 2 + 1;
  const frequencies = new Float64Array(binCount);
  const times = new Float64Array(frameCount);
  const magnitude = Array.from({ length: binCount }, () => Array<number>(frameCount).fill(0));
  const window = hannWindow(nperseg);

  for (let bin = 0; bin < binCount; bin += 1) {
    frequencies[bin] = (bin * sampleRate) / nperseg;
  }

  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * hop;
    const segment = new Float64Array(nperseg);
    for (let index = 0; index < nperseg; index += 1) {
      segment[index] = audio[start + index] * window[index];
    }
    const spectrum = fftReal(segment);
    times[frame] = (start + nperseg / 2) / sampleRate;
    for (let bin = 0; bin < binCount; bin += 1) {
      const value = spectrum[bin];
      magnitude[bin][frame] = Math.hypot(value.re, value.im);
    }
  }

  return { frequencies, times, magnitude };
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * percentileValue;
  const base = Math.floor(position);
  const rest = position - base;
  if (sorted[base + 1] === undefined) {
    return sorted[base];
  }
  return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

export function extractFeatures(audio: Float64Array, sampleRate: number): DetectionFeatures {
  const spectrogram = computeSpectrogram(audio, sampleRate);
  const { frequencies, times, magnitude } = spectrogram;
  const frameCount = times.length;
  const bandBins: number[] = [];
  for (let bin = 0; bin < frequencies.length; bin += 1) {
    if (frequencies[bin] >= SIREN_BAND[0] && frequencies[bin] <= SIREN_BAND[1]) {
      bandBins.push(bin);
    }
  }

  const bandRatioByFrame = new Float64Array(frameCount);
  const dominantFreq = new Float64Array(frameCount);
  const active: boolean[] = Array(frameCount).fill(false);

  for (let frame = 0; frame < frameCount; frame += 1) {
    let totalPower = 1e-12;
    let bandPower = 0;
    let dominantPower = -Infinity;
    let dominantBin = bandBins[0] ?? 0;

    for (let bin = 0; bin < frequencies.length; bin += 1) {
      const power = magnitude[bin][frame] ** 2;
      totalPower += power;
    }

    for (const bin of bandBins) {
      const power = magnitude[bin][frame] ** 2;
      bandPower += power;
      if (power > dominantPower) {
        dominantPower = power;
        dominantBin = bin;
      }
    }

    const meanBandPower = bandPower / Math.max(1, bandBins.length);
    const prominence = dominantPower / Math.max(meanBandPower, 1e-12);
    bandRatioByFrame[frame] = bandPower / totalPower;
    dominantFreq[frame] = frequencies[dominantBin] ?? 0;
    active[frame] = bandRatioByFrame[frame] > 0.25 && prominence > 4.0;
  }

  const meanBandRatio =
    frameCount > 0 ? bandRatioByFrame.reduce((sum, value) => sum + value, 0) / frameCount : 0;
  const persistence = frameCount > 0 ? active.filter(Boolean).length / frameCount : 0;
  const activeFreq = Array.from(dominantFreq).filter((_freq, index) => active[index]);
  let sweepScore = 0;

  if (activeFreq.length > 5) {
    const diffs = activeFreq.slice(1).map((freq, index) => freq - activeFreq[index]);
    const meaningful = diffs.filter((diff) => Math.abs(diff) > 12);
    let reversals = 0;
    for (let index = 1; index < meaningful.length; index += 1) {
      if (Math.sign(meaningful[index]) !== Math.sign(meaningful[index - 1])) {
        reversals += 1;
      }
    }
    const freqSpan = percentile(activeFreq, 0.95) - percentile(activeFreq, 0.05);
    sweepScore = Math.min(1, (freqSpan / 600) * Math.min(1, reversals / 4));
  }

  return {
    ...spectrogram,
    bandRatioByFrame,
    dominantFreq,
    active,
    meanBandRatio,
    persistence,
    sweepScore
  };
}

export function bandpassFilter(audio: Float64Array, sampleRate: number, lowHz = SIREN_BAND[0], highHz = SIREN_BAND[1]) {
  const center = Math.sqrt(lowHz * highHz);
  const q = center / (highHz - lowHz);
  const omega = (2 * Math.PI * center) / sampleRate;
  const alpha = Math.sin(omega) / (2 * q);
  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(omega);
  const a2 = 1 - alpha;
  const output = new Float64Array(audio.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  for (let index = 0; index < audio.length; index += 1) {
    const x0 = audio[index];
    const y0 = (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    output[index] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  return output;
}
