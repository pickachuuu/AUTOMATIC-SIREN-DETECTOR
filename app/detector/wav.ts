import { WaveFile } from "wavefile";
import { TARGET_SAMPLE_RATE, type WavAudio } from "./types";

interface WaveFmt {
  audioFormat: number;
  numChannels: number;
  sampleRate: number;
}

function getFmt(wav: InstanceType<typeof WaveFile>) {
  return wav.fmt as WaveFmt;
}

function decodeSupportedCompression(wav: InstanceType<typeof WaveFile>) {
  const format = getFmt(wav).audioFormat;
  if (format === 6) {
    wav.fromALaw("32f");
  } else if (format === 7) {
    wav.fromMuLaw("32f");
  } else if (format === 17) {
    wav.fromIMAADPCM("32f");
  } else {
    wav.toBitDepth("32f");
  }
}

export function decodeWav(bytes: ArrayBuffer | Uint8Array): WavAudio {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const wav = new WaveFile(source);
  decodeSupportedCompression(wav);

  const fmt = getFmt(wav);
  const channels = Math.max(1, fmt.numChannels);
  const interleaved = wav.getSamples(true, Float64Array);
  const frameCount = Math.floor(interleaved.length / channels);
  const samples = new Float64Array(frameCount);

  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum += interleaved[frame * channels + channel];
    }
    samples[frame] = sum / channels;
  }

  return normalizeAudio({ sampleRate: fmt.sampleRate, samples });
}

export function normalizeAudio(audio: WavAudio): WavAudio {
  const samples = new Float64Array(audio.samples);
  if (samples.length === 0) {
    return { sampleRate: audio.sampleRate, samples };
  }

  let mean = 0;
  for (const sample of samples) {
    mean += sample;
  }
  mean /= samples.length;

  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] -= mean;
    peak = Math.max(peak, Math.abs(samples[index]));
  }

  if (peak > 0) {
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] /= peak;
    }
  }

  return { sampleRate: audio.sampleRate, samples };
}

export function resampleLinear(audio: WavAudio, targetSampleRate = TARGET_SAMPLE_RATE): WavAudio {
  if (audio.sampleRate === targetSampleRate || audio.samples.length === 0) {
    return audio;
  }

  const ratio = targetSampleRate / audio.sampleRate;
  const outputLength = Math.max(1, Math.round(audio.samples.length * ratio));
  const output = new Float64Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const sourcePosition = index / ratio;
    const left = Math.floor(sourcePosition);
    const right = Math.min(audio.samples.length - 1, left + 1);
    const fraction = sourcePosition - left;
    output[index] = audio.samples[left] * (1 - fraction) + audio.samples[right] * fraction;
  }

  return normalizeAudio({ sampleRate: targetSampleRate, samples: output });
}
