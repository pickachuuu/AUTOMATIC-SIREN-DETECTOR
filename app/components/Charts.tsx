import { useEffect, useRef } from "react";
import { SIREN_BAND, type AnalysisResult } from "../detector/types";

interface ChartProps {
  result: AnalysisResult | null;
  highlightIntervals?: Array<[number, number]>;
}

function setupCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas rendering is unavailable.");
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  return { context, width: rect.width, height: rect.height };
}

function drawAxes(context: CanvasRenderingContext2D, width: number, height: number, label: string) {
  context.strokeStyle = "rgba(148, 210, 255, 0.22)";
  context.lineWidth = 1;
  context.strokeRect(42, 12, width - 54, height - 38);
  context.strokeStyle = "rgba(148, 210, 255, 0.075)";
  for (let index = 1; index < 5; index += 1) {
    const x = 42 + ((width - 54) * index) / 5;
    const y = 12 + ((height - 38) * index) / 5;
    context.beginPath();
    context.moveTo(x, 12);
    context.lineTo(x, height - 26);
    context.moveTo(42, y);
    context.lineTo(width - 12, y);
    context.stroke();
  }
  context.fillStyle = "rgba(219, 242, 255, 0.72)";
  context.font = "12px Inter, Segoe UI, sans-serif";
  context.fillText(label, 48, height - 10);
}

function strokeGlow(context: CanvasRenderingContext2D, color: string, blur: number, draw: () => void) {
  context.save();
  context.shadowColor = color;
  context.shadowBlur = blur;
  draw();
  context.restore();
}

function drawHighlightIntervals(
  context: CanvasRenderingContext2D,
  intervals: Array<[number, number]>,
  durationSeconds: number,
  left: number,
  top: number,
  plotWidth: number,
  plotHeight: number
) {
  if (!durationSeconds || intervals.length === 0) {
    return;
  }

  context.save();
  for (const [start, end] of intervals) {
    const x = left + (Math.max(0, start) / durationSeconds) * plotWidth;
    const width = Math.max(2, ((Math.min(durationSeconds, end) - Math.max(0, start)) / durationSeconds) * plotWidth);
    context.fillStyle = "rgba(239, 68, 68, 0.22)";
    context.fillRect(x, top, width, plotHeight);
    context.strokeStyle = "rgba(250, 204, 21, 0.86)";
    context.lineWidth = 1.5;
    context.strokeRect(x, top, width, plotHeight);
  }
  context.restore();
}

export function WaveformCanvas({ result, highlightIntervals = [] }: ChartProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !result) {
      return;
    }
    const { context, width, height } = setupCanvas(canvas);
    const left = 42;
    const top = 12;
    const plotWidth = width - 54;
    const plotHeight = height - 38;
    const centerRaw = top + plotHeight * 0.28;
    const centerFiltered = top + plotHeight * 0.72;
    const step = Math.max(1, Math.floor(result.waveform.length / plotWidth));

    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#07121f");
    gradient.addColorStop(1, "#020610");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    drawAxes(context, width, height, "time domain: raw signal and band-pass response");
    drawHighlightIntervals(context, highlightIntervals, result.durationSeconds, left, top, plotWidth, plotHeight);
    context.strokeStyle = "rgba(70, 242, 167, 0.9)";
    context.lineWidth = 1.4;
    strokeGlow(context, "rgba(70, 242, 167, 0.5)", 14, () => {
      context.beginPath();
      for (let index = 0; index < result.waveform.length; index += step) {
        const x = left + (index / Math.max(1, result.waveform.length - 1)) * plotWidth;
        const y = centerRaw - result.waveform[index] * plotHeight * 0.22;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    });

    context.strokeStyle = "rgba(94, 231, 255, 0.96)";
    context.lineWidth = 1.8;
    strokeGlow(context, "rgba(94, 231, 255, 0.58)", 18, () => {
      context.beginPath();
      for (let index = 0; index < result.filteredWaveform.length; index += step) {
        const x = left + (index / Math.max(1, result.filteredWaveform.length - 1)) * plotWidth;
        const y = centerFiltered - result.filteredWaveform[index] * plotHeight * 0.22;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    });
  }, [result, highlightIntervals]);

  return <canvas ref={ref} className="chart-canvas" aria-label="Waveform chart" />;
}

export function SpectrogramCanvas({ result, highlightIntervals = [] }: ChartProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !result) {
      return;
    }
    const { context, width, height } = setupCanvas(canvas);
    const left = 42;
    const top = 12;
    const plotWidth = width - 54;
    const plotHeight = height - 38;
    const { magnitude, frequencies, times } = result.spectrogram;
    const maxFreq = 3000;
    let minDb = -80;
    let maxDb = -20;

    for (let bin = 0; bin < frequencies.length; bin += 1) {
      if (frequencies[bin] > maxFreq) break;
      for (let frame = 0; frame < times.length; frame += 1) {
        const db = 20 * Math.log10(magnitude[bin][frame] + 1e-8);
        minDb = Math.min(minDb, db);
        maxDb = Math.max(maxDb, db);
      }
    }

    const background = context.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, "#07111e");
    background.addColorStop(1, "#020510");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    for (let frame = 0; frame < times.length; frame += 1) {
      const x = left + (frame / Math.max(1, times.length - 1)) * plotWidth;
      const nextX = left + ((frame + 1) / Math.max(1, times.length)) * plotWidth;
      for (let bin = 0; bin < frequencies.length; bin += 1) {
        const freq = frequencies[bin];
        if (freq > maxFreq) break;
        const db = 20 * Math.log10(magnitude[bin][frame] + 1e-8);
        const normalized = Math.min(1, Math.max(0, (db - minDb) / Math.max(1, maxDb - minDb)));
        const hue = 244 - normalized * 185;
        const saturation = 74 + normalized * 22;
        const lightness = 8 + normalized * 66;
        context.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        const y = top + plotHeight - (freq / maxFreq) * plotHeight;
        const binHeight = plotHeight / (maxFreq / (frequencies[1] - frequencies[0]));
        context.fillRect(x, y, Math.max(1, nextX - x + 1), Math.max(1, binHeight + 1));
      }
    }

    drawHighlightIntervals(context, highlightIntervals, result.durationSeconds, left, top, plotWidth, plotHeight);
    context.strokeStyle = "rgba(94, 231, 255, 0.86)";
    context.lineWidth = 1.5;
    context.shadowColor = "rgba(94, 231, 255, 0.72)";
    context.shadowBlur = 16;
    for (const band of SIREN_BAND) {
      const y = top + plotHeight - (band / maxFreq) * plotHeight;
      context.beginPath();
      context.moveTo(left, y);
      context.lineTo(left + plotWidth, y);
      context.stroke();
    }
    context.shadowBlur = 0;
    drawAxes(context, width, height, "STFT spectrogram, 0-3000 Hz");
  }, [result, highlightIntervals]);

  return <canvas ref={ref} className="chart-canvas" aria-label="STFT spectrogram" />;
}

export function FrequencyTrackCanvas({ result, highlightIntervals = [] }: ChartProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !result) {
      return;
    }
    const { context, width, height } = setupCanvas(canvas);
    const left = 42;
    const top = 12;
    const plotWidth = width - 54;
    const plotHeight = height - 38;
    const minFreq = SIREN_BAND[0] - 150;
    const maxFreq = SIREN_BAND[1] + 150;
    const freqToY = (freq: number) => top + plotHeight - ((freq - minFreq) / (maxFreq - minFreq)) * plotHeight;

    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#07121f");
    gradient.addColorStop(1, "#020610");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    drawAxes(context, width, height, "dominant siren-band frequency track");
    drawHighlightIntervals(context, highlightIntervals, result.durationSeconds, left, top, plotWidth, plotHeight);
    context.strokeStyle = "rgba(255, 209, 102, 0.96)";
    context.lineWidth = 2.4;
    strokeGlow(context, "rgba(255, 209, 102, 0.62)", 18, () => {
      context.beginPath();
      for (let index = 0; index < result.dominantFreq.length; index += 1) {
        const x = left + (index / Math.max(1, result.dominantFreq.length - 1)) * plotWidth;
        const y = freqToY(result.dominantFreq[index]);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    });

    context.fillStyle = "rgba(255, 77, 109, 0.94)";
    context.shadowColor = "rgba(255, 77, 109, 0.72)";
    context.shadowBlur = 14;
    for (let index = 0; index < result.active.length; index += 1) {
      if (!result.active[index]) continue;
      const x = left + (index / Math.max(1, result.active.length - 1)) * plotWidth;
      const y = freqToY(result.dominantFreq[index]);
      context.beginPath();
      context.arc(x, y, 3, 0, Math.PI * 2);
      context.fill();
    }
    context.shadowBlur = 0;
  }, [result, highlightIntervals]);

  return <canvas ref={ref} className="chart-canvas" aria-label="Frequency track chart" />;
}
