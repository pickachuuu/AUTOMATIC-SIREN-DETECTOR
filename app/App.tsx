import { Activity, AlertTriangle, Download, FileAudio, FolderOpen, Loader2, RadioTower, Waves } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeWavBytes, resultToJson } from "./detector/analyze";
import type { AnalysisResult } from "./detector/types";
import { FrequencyTrackCanvas, SpectrogramCanvas, WaveformCanvas } from "./components/Charts";

interface HistoryEntry {
  filename: string;
  detected: boolean;
  confidence: number;
  time: string;
}

type ChartTab = "waveform" | "spectrogram" | "track";

function bytesFromDesktopFile(file: DesktopFile) {
  return new Uint8Array(file.bytes).buffer;
}

function formatIntervals(result: AnalysisResult | null) {
  if (!result || result.intervalsSeconds.length === 0) {
    return "none";
  }
  return result.intervalsSeconds.map(([start, end]) => `${start.toFixed(2)}s-${end.toFixed(2)}s`).join(", ");
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
      { label: "Band ratio", value: result ? result.sirenBandEnergyRatio.toFixed(3) : "--" },
      { label: "Sweep", value: result ? result.sweepScore.toFixed(3) : "--" },
      { label: "Persistence", value: result ? result.persistence.toFixed(3) : "--" }
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
      setHistory((items) => [
        {
          filename: name,
          detected: analysis.detected,
          confidence: analysis.confidence,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        },
        ...items
      ].slice(0, 8));
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

  const statusLabel = isAnalyzing
    ? "Analyzing audio"
    : result
      ? result.detected
        ? "Siren detected"
        : "No siren detected"
      : "Waiting for input";

  return (
    <main className="app-shell">
      <section className="control-rail" aria-label="Input controls">
        <div className="brand-lockup">
          <RadioTower aria-hidden="true" />
          <div>
            <h1>Automatic Siren Detector</h1>
            <p>Signal-first emergency siren analysis</p>
          </div>
        </div>

        <div
          className="drop-zone"
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
          <FileAudio aria-hidden="true" />
          <strong>Drop WAV audio</strong>
          <span>or browse from disk</span>
        </div>

        <input
          ref={fileInputRef}
          className="file-input"
          type="file"
          accept=".wav,audio/wav,audio/x-wav"
          onChange={(event) => void handleFileInput(event)}
        />

        <button className="primary-action" type="button" onClick={handleBrowse} disabled={isAnalyzing}>
          <FolderOpen aria-hidden="true" />
          Browse audio
        </button>

        <div className="sample-list">
          <div className="section-label">Bundled samples</div>
          {samples.map((sample) => (
            <button key={sample.path} type="button" onClick={() => void handleSample(sample)} disabled={isAnalyzing}>
              <Waves aria-hidden="true" />
              <span>{sample.name.replace(".wav", "")}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="analysis-stage" aria-label="Analysis dashboard">
        <header className="stage-header">
          <div>
            <span className="section-label">Current file</span>
            <h2>{selectedName}</h2>
            {selectedPath ? <p>{selectedPath}</p> : <p>Choose a sample or load a local WAV file.</p>}
          </div>
          <div className={`status-pill ${result?.detected ? "danger" : result ? "clear" : ""}`} aria-live="polite">
            {isAnalyzing ? <Loader2 className="spin" aria-hidden="true" /> : <Activity aria-hidden="true" />}
            {statusLabel}
          </div>
        </header>

        {error ? (
          <div className="error-banner" role="alert">
            <AlertTriangle aria-hidden="true" />
            {error}
          </div>
        ) : null}

        <div className="metric-grid">
          {metrics.map((metric) => (
            <div className="metric-tile" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>

        <div className="interval-strip">
          <span>Detected intervals</span>
          <strong>{formatIntervals(result)}</strong>
        </div>

        <div className="visual-panel">
          <div className="tab-row" role="tablist" aria-label="Visualization type">
            {(["waveform", "spectrogram", "track"] as ChartTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={chartTab === tab ? "active" : ""}
                onClick={() => setChartTab(tab)}
                role="tab"
                aria-selected={chartTab === tab}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="chart-frame">
            {chartTab === "waveform" ? <WaveformCanvas result={result} /> : null}
            {chartTab === "spectrogram" ? <SpectrogramCanvas result={result} /> : null}
            {chartTab === "track" ? <FrequencyTrackCanvas result={result} /> : null}
            {!result && !isAnalyzing ? <div className="empty-chart">Load audio to render signal views.</div> : null}
          </div>
        </div>
      </section>

      <aside className="history-rail" aria-label="Recent runs">
        <div className="history-header">
          <div>
            <span className="section-label">Session</span>
            <h2>Recent runs</h2>
          </div>
          <button type="button" onClick={handleExport} disabled={!result}>
            <Download aria-hidden="true" />
            JSON
          </button>
        </div>
        <div className="theory-stack">
          <div>
            <span>Sampling</span>
            <p>Audio is normalized and resampled to 16 kHz for stable analysis.</p>
          </div>
          <div>
            <span>STFT</span>
            <p>Overlapping Hann windows expose time-varying frequency content.</p>
          </div>
          <div>
            <span>Sweep score</span>
            <p>Active frames are scored by repeated dominant-frequency reversals.</p>
          </div>
        </div>
        <div className="history-list">
          {history.length === 0 ? <p>No analyses yet.</p> : null}
          {history.map((entry) => (
            <div className="history-item" key={`${entry.time}-${entry.filename}`}>
              <strong>{entry.detected ? "YES" : "NO"}</strong>
              <span>{entry.confidence.toFixed(3)}</span>
              <p>{entry.filename}</p>
              <time>{entry.time}</time>
            </div>
          ))}
        </div>
      </aside>
    </main>
  );
}
