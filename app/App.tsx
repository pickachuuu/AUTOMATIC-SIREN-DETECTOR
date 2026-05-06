import {
  Activity,
  AlertTriangle,
  Download,
  FileAudio,
  FolderOpen,
  Loader2,
  RadioTower,
  Siren,
  Waves,
  Zap
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FrequencyTrackCanvas, SpectrogramCanvas, WaveformCanvas } from "./components/Charts";
import { analyzeWavBytes, resultToJson } from "./detector/analyze";
import type { AnalysisResult } from "./detector/types";

interface HistoryEntry {
  filename: string;
  detected: boolean;
  confidence: number;
  time: string;
}

type ChartTab = "waveform" | "spectrogram" | "track";

const chartTabs: Array<{ id: ChartTab; label: string }> = [
  { id: "spectrogram", label: "STFT" },
  { id: "track", label: "Sweep" },
  { id: "waveform", label: "Wave" }
];

function bytesFromDesktopFile(file: DesktopFile) {
  return new Uint8Array(file.bytes).buffer;
}

function formatIntervals(result: AnalysisResult | null) {
  if (!result || result.intervalsSeconds.length === 0) {
    return "none";
  }
  return result.intervalsSeconds.map(([start, end]) => `${start.toFixed(2)}s-${end.toFixed(2)}s`).join(", ");
}

function panelClass(extra = "") {
  return `border-2 border-zinc-100 bg-zinc-950/92 shadow-[8px_8px_0_#e4e4e7] ${extra}`;
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [samples, setSamples] = useState<BundledSample[]>([]);
  const [selectedName, setSelectedName] = useState("No file selected");
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [chartTab, setChartTab] = useState<ChartTab>("spectrogram");

  useEffect(() => {
    void window.sirenDesktop?.listBundledSamples().then(setSamples).catch(() => setSamples([]));
  }, []);

  const metrics = useMemo(
    () => [
      { label: "Confidence", value: result ? result.confidence.toFixed(3) : "--" },
      { label: "Band", value: result ? result.sirenBandEnergyRatio.toFixed(3) : "--" },
      { label: "Sweep", value: result ? result.sweepScore.toFixed(3) : "--" },
      { label: "Persist", value: result ? result.persistence.toFixed(3) : "--" }
    ],
    [result]
  );

  async function runAnalysis(name: string, buffer: ArrayBuffer, filePath?: string) {
    setIsAnalyzing(true);
    setError("");
    setSelectedName(name);
    setSelectedPath(filePath);

    try {
      const analysis = analyzeWavBytes(buffer, name);
      setResult(analysis);
      setHistory((items) =>
        [
          {
            filename: name,
            detected: analysis.detected,
            confidence: analysis.confidence,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
          },
          ...items
        ].slice(0, 8)
      );
    } catch (analysisError) {
      setResult(null);
      setError(analysisError instanceof Error ? analysisError.message : "Analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleBrowse() {
    if (window.sirenDesktop) {
      const file = await window.sirenDesktop.selectWavFile();
      if (!file) return;
      await runAnalysis(file.name, bytesFromDesktopFile(file), file.path);
      return;
    }

    fileInputRef.current?.click();
  }

  async function handleFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.item(0);
    event.target.value = "";
    if (!file) return;
    await runAnalysis(file.name, await file.arrayBuffer());
  }

  async function handleSample(sample: BundledSample) {
    const file = await window.sirenDesktop?.readBundledSample(sample.path);
    if (!file) return;
    await runAnalysis(file.name, bytesFromDesktopFile(file), file.path);
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files.item(0);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".wav")) {
      setError("Please drop a WAV file.");
      return;
    }
    await runAnalysis(file.name, await file.arrayBuffer());
  }

  async function handleExport() {
    if (!result) return;
    await window.sirenDesktop?.exportAnalysisJson(`${result.filename.replace(/\.wav$/i, "")}.json`, resultToJson(result));
  }

  const detected = Boolean(result?.detected);
  const hasResult = Boolean(result);
  const statusLabel = isAnalyzing ? "Scanning" : detected ? "Siren detected" : hasResult ? "Signal clear" : "Armed";
  const statusTone = detected
    ? "border-red-500 bg-red-500 text-zinc-950 shadow-[6px_6px_0_#facc15]"
    : hasResult
      ? "border-emerald-400 bg-emerald-400 text-zinc-950 shadow-[6px_6px_0_#ffffff]"
      : "border-yellow-300 bg-yellow-300 text-zinc-950 shadow-[6px_6px_0_#ef4444]";

  return (
    <main className="relative h-dvh overflow-hidden bg-[radial-gradient(circle_at_12%_0%,rgba(239,68,68,0.38),transparent_28%),radial-gradient(circle_at_88%_10%,rgba(250,204,21,0.28),transparent_24%),linear-gradient(135deg,#050505_0%,#101010_42%,#050505_100%)] p-2 text-zinc-100 sm:p-3 lg:p-4">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:36px_36px]" />
      <div className="relative z-10 grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
        <header className="grid min-h-[76px] grid-cols-[1fr_auto] gap-3 border-2 border-zinc-100 bg-zinc-950 shadow-[8px_8px_0_#ef4444]">
          <div className="flex min-w-0 items-center gap-3 px-3 py-2 sm:px-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center border-2 border-zinc-100 bg-red-500 text-zinc-950 shadow-[4px_4px_0_#facc15]">
              <Siren className="h-7 w-7" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-yellow-300">Signals and systems</p>
              <h1 className="truncate text-xl font-black uppercase leading-none tracking-tight sm:text-3xl">
                Automatic Siren Detector
              </h1>
            </div>
          </div>
          <div className={`m-2 flex min-w-[156px] items-center justify-center gap-2 border-2 px-3 py-2 text-sm font-black uppercase ${statusTone}`}>
            {isAnalyzing ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Activity className="h-5 w-5" aria-hidden="true" />}
            {statusLabel}
          </div>
        </header>

        <div className="grid min-h-0 gap-3 xl:grid-cols-[260px_minmax(0,1fr)_300px] lg:grid-cols-[230px_minmax(0,1fr)]">
          <section className={`${panelClass("min-h-0 overflow-hidden")} flex flex-col`} aria-label="Input controls">
            <div className="border-b-2 border-zinc-100 p-3">
              <div className="flex items-center gap-2">
                <RadioTower className="h-5 w-5 text-red-400" aria-hidden="true" />
                <h2 className="text-base font-black uppercase">Input</h2>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
              <div
                className="grid min-h-32 cursor-pointer place-items-center border-2 border-dashed border-yellow-300 bg-yellow-300 p-3 text-center text-zinc-950 transition hover:-translate-y-0.5 hover:bg-red-500 hover:text-zinc-950"
                onClick={() => void handleBrowse()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    void handleBrowse();
                  }
                }}
                onDrop={handleDrop}
                onDragOver={(event) => event.preventDefault()}
                role="button"
                tabIndex={0}
                aria-label="Drop a WAV file for analysis"
              >
                <FileAudio className="mb-2 h-9 w-9" aria-hidden="true" />
                <strong className="text-lg font-black uppercase leading-none">Drop WAV</strong>
                <span className="mt-1 text-xs font-bold uppercase">or click to browse</span>
              </div>

              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                accept=".wav,audio/wav,audio/x-wav"
                onChange={(event) => void handleFileInput(event)}
              />

              <button
                className="flex min-h-11 items-center justify-center gap-2 border-2 border-zinc-100 bg-red-500 px-3 text-sm font-black uppercase text-zinc-950 shadow-[4px_4px_0_#ffffff] transition hover:-translate-y-0.5 disabled:opacity-50"
                type="button"
                onClick={handleBrowse}
                disabled={isAnalyzing}
              >
                <FolderOpen className="h-5 w-5" aria-hidden="true" />
                Browse audio
              </button>

              <div className="min-h-0">
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Bundled samples</p>
                <div className="grid gap-2">
                  {samples.map((sample) => (
                    <button
                      key={sample.path}
                      type="button"
                      onClick={() => void handleSample(sample)}
                      disabled={isAnalyzing}
                      className="flex min-h-9 items-center gap-2 border-2 border-zinc-700 bg-zinc-900 px-2 text-left text-xs font-black uppercase text-zinc-100 transition hover:border-zinc-100 hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-50"
                    >
                      <Waves className="h-4 w-4 shrink-0 text-yellow-300" aria-hidden="true" />
                      <span className="truncate">{sample.name.replace(".wav", "")}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className={`${panelClass("min-h-0 overflow-hidden")} flex flex-col`} aria-label="Analysis dashboard">
            <div className="grid gap-3 border-b-2 border-zinc-100 p-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Current file</p>
                <h2 className="truncate text-xl font-black uppercase leading-tight text-zinc-100 md:text-2xl">{selectedName}</h2>
                <p className="truncate text-xs text-zinc-400">{selectedPath ?? "Choose a sample or load a local WAV file."}</p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {metrics.map((metric) => (
                  <div key={metric.label} className="min-w-20 border-2 border-zinc-700 bg-zinc-900 p-2 text-center">
                    <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">{metric.label}</p>
                    <strong className="font-mono text-lg font-black text-yellow-300">{metric.value}</strong>
                  </div>
                ))}
              </div>
            </div>

            {error ? (
              <div className="mx-3 mt-3 flex min-h-11 items-center gap-2 border-2 border-red-500 bg-red-500 px-3 text-sm font-black text-zinc-950" role="alert">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                {error}
              </div>
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col p-3 pt-3">
              <div className="mb-3 grid gap-3 md:grid-cols-[1fr_auto]">
                <div className="border-2 border-zinc-700 bg-zinc-900 px-3 py-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Detected intervals</p>
                  <p className="truncate font-mono text-sm font-black text-zinc-100">{formatIntervals(result)}</p>
                </div>
                <div className="flex border-2 border-zinc-100 bg-zinc-100 p-1 text-zinc-950">
                  {chartTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={`min-h-9 px-4 text-xs font-black uppercase transition ${
                        chartTab === tab.id ? "bg-zinc-950 text-zinc-100" : "hover:bg-yellow-300"
                      }`}
                      onClick={() => setChartTab(tab.id)}
                      role="tab"
                      aria-selected={chartTab === tab.id}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`relative min-h-0 flex-1 overflow-hidden border-2 border-zinc-100 bg-black ${isAnalyzing ? "is-scanning" : ""}`}>
                <div className="absolute left-3 top-3 z-10 flex items-center gap-2 border-2 border-zinc-100 bg-zinc-950/90 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-yellow-300">
                  <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                  {chartTab === "spectrogram" ? "Time-frequency scan" : chartTab === "waveform" ? "Waveform response" : "Sweep trajectory"}
                </div>
                {chartTab === "waveform" ? <WaveformCanvas result={result} /> : null}
                {chartTab === "spectrogram" ? <SpectrogramCanvas result={result} /> : null}
                {chartTab === "track" ? <FrequencyTrackCanvas result={result} /> : null}
                {!result && !isAnalyzing ? (
                  <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,rgba(250,204,21,0.14),transparent_38%)] text-center">
                    <div className="border-2 border-zinc-100 bg-zinc-950 p-5 shadow-[8px_8px_0_#ef4444]">
                      <Waves className="mx-auto mb-3 h-10 w-10 text-yellow-300" aria-hidden="true" />
                      <strong className="block text-lg font-black uppercase">Signal workspace armed</strong>
                      <span className="text-sm text-zinc-400">Load audio to render the detector traces.</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <aside className={`${panelClass("hidden min-h-0 overflow-hidden xl:flex")} flex-col`} aria-label="Recent runs">
            <div className="flex items-center justify-between border-b-2 border-zinc-100 p-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Evidence</p>
                <h2 className="text-base font-black uppercase">Run log</h2>
              </div>
              <button
                type="button"
                onClick={handleExport}
                disabled={!result}
                className="flex min-h-9 items-center gap-2 border-2 border-zinc-100 bg-yellow-300 px-2 text-xs font-black uppercase text-zinc-950 transition hover:bg-red-500 disabled:opacity-50"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                JSON
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="mb-3 grid gap-2">
                {[
                  ["Sampling", "Normalized and resampled to 16 kHz."],
                  ["STFT", "Hann windows reveal moving frequency energy."],
                  ["Sweep", "Repeated dominant-frequency reversals raise confidence."]
                ].map(([label, copy]) => (
                  <div key={label} className="border-2 border-zinc-700 bg-zinc-900 p-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">{label}</p>
                    <p className="mt-1 text-xs leading-snug text-zinc-400">{copy}</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-2">
                {history.length === 0 ? <p className="text-sm font-bold text-zinc-500">No analyses yet.</p> : null}
                {history.map((entry) => (
                  <div key={`${entry.time}-${entry.filename}`} className="grid grid-cols-[auto_1fr] gap-x-2 border-2 border-zinc-700 bg-zinc-900 p-2">
                    <strong className={entry.detected ? "text-red-400" : "text-emerald-300"}>{entry.detected ? "YES" : "NO"}</strong>
                    <span className="font-mono text-sm font-black text-yellow-300">{entry.confidence.toFixed(3)}</span>
                    <p className="col-span-2 truncate text-xs font-bold text-zinc-100">{entry.filename}</p>
                    <time className="col-span-2 text-[10px] font-bold uppercase text-zinc-500">{entry.time}</time>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
