from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, filtfilt, find_peaks, resample_poly, stft


TARGET_SAMPLE_RATE = 16_000
SIREN_BAND = (500.0, 1800.0)


@dataclass
class DetectionResult:
    detected: bool
    confidence: float
    siren_band_energy_ratio: float
    sweep_score: float
    persistence: float
    intervals_seconds: list[tuple[float, float]]


def load_audio(path: str | Path, target_sample_rate: int = TARGET_SAMPLE_RATE) -> tuple[int, np.ndarray]:
    sample_rate, audio = wavfile.read(path)
    audio = np.asarray(audio)

    if audio.ndim == 2:
        audio = audio.mean(axis=1)

    if np.issubdtype(audio.dtype, np.integer):
        max_value = np.iinfo(audio.dtype).max
        audio = audio.astype(np.float64) / max_value
    else:
        audio = audio.astype(np.float64)

    audio = audio - np.mean(audio)
    peak = np.max(np.abs(audio)) if audio.size else 0.0
    if peak > 0:
        audio = audio / peak

    if sample_rate != target_sample_rate and audio.size:
        gcd = np.gcd(sample_rate, target_sample_rate)
        audio = resample_poly(audio, target_sample_rate // gcd, sample_rate // gcd)
        sample_rate = target_sample_rate

    return sample_rate, audio


def bandpass_filter(
    audio: np.ndarray,
    sample_rate: int,
    low_hz: float = SIREN_BAND[0],
    high_hz: float = SIREN_BAND[1],
    order: int = 4,
) -> np.ndarray:
    nyquist = sample_rate / 2
    low = low_hz / nyquist
    high = high_hz / nyquist
    b, a = butter(order, [low, high], btype="bandpass")
    return filtfilt(b, a, audio)


def compute_spectrogram(audio: np.ndarray, sample_rate: int):
    return stft(
        audio,
        fs=sample_rate,
        window="hann",
        nperseg=1024,
        noverlap=512,
        boundary=None,
    )


def _frame_intervals(active: np.ndarray, times: np.ndarray) -> list[tuple[float, float]]:
    intervals: list[tuple[float, float]] = []
    start = None
    frame_step = float(np.median(np.diff(times))) if len(times) > 1 else 0.0

    for index, is_active in enumerate(active):
        if is_active and start is None:
            start = float(times[index])
        elif not is_active and start is not None:
            intervals.append((start, float(times[index - 1] + frame_step)))
            start = None

    if start is not None and len(times):
        intervals.append((start, float(times[-1] + frame_step)))

    return intervals


def extract_features(audio: np.ndarray, sample_rate: int) -> dict:
    frequencies, times, spectrum = compute_spectrogram(audio, sample_rate)
    magnitude = np.abs(spectrum)
    power = magnitude**2

    band_mask = (frequencies >= SIREN_BAND[0]) & (frequencies <= SIREN_BAND[1])
    band_power = power[band_mask, :]
    total_power = np.maximum(power.sum(axis=0), 1e-12)

    band_ratio_by_frame = band_power.sum(axis=0) / total_power
    mean_band_ratio = float(np.mean(band_ratio_by_frame))

    band_frequencies = frequencies[band_mask]
    dominant_indices = np.argmax(band_power, axis=0)
    dominant_freq = band_frequencies[dominant_indices]
    dominant_power = band_power[dominant_indices, np.arange(band_power.shape[1])]
    prominence = dominant_power / np.maximum(np.mean(band_power, axis=0), 1e-12)

    active = (band_ratio_by_frame > 0.25) & (prominence > 4.0)
    persistence = float(np.mean(active)) if active.size else 0.0

    active_freq = dominant_freq[active]
    if active_freq.size > 5:
        diff = np.diff(active_freq)
        meaningful = np.abs(diff) > 12.0
        sign_changes = np.diff(np.sign(diff[meaningful])) if np.any(meaningful) else np.array([])
        reversals = int(np.sum(sign_changes != 0))
        freq_span = float(np.percentile(active_freq, 95) - np.percentile(active_freq, 5))
        sweep_score = min(1.0, (freq_span / 600.0) * min(1.0, reversals / 4.0))
    else:
        sweep_score = 0.0

    return {
        "frequencies": frequencies,
        "times": times,
        "magnitude": magnitude,
        "band_ratio_by_frame": band_ratio_by_frame,
        "dominant_freq": dominant_freq,
        "active": active,
        "mean_band_ratio": mean_band_ratio,
        "persistence": persistence,
        "sweep_score": sweep_score,
    }


def detect_siren(audio: np.ndarray, sample_rate: int) -> tuple[DetectionResult, dict, np.ndarray]:
    filtered = bandpass_filter(audio, sample_rate)
    features = extract_features(audio, sample_rate)

    band_score = min(1.0, features["mean_band_ratio"] / 0.40)
    persistence_score = min(1.0, features["persistence"] / 0.25)
    sweep_score = features["sweep_score"]
    confidence = float(0.35 * band_score + 0.30 * persistence_score + 0.35 * sweep_score)

    detected = (
        confidence >= 0.55
        and features["persistence"] >= 0.15
        and features["sweep_score"] >= 0.25
    )

    result = DetectionResult(
        detected=detected,
        confidence=round(confidence, 3),
        siren_band_energy_ratio=round(features["mean_band_ratio"], 3),
        sweep_score=round(features["sweep_score"], 3),
        persistence=round(features["persistence"], 3),
        intervals_seconds=_frame_intervals(features["active"], features["times"]),
    )
    return result, features, filtered


def plot_results(
    audio: np.ndarray,
    filtered: np.ndarray,
    sample_rate: int,
    features: dict,
    result: DetectionResult,
    out_prefix: str | Path,
) -> None:
    out_prefix = Path(out_prefix)
    out_prefix.parent.mkdir(parents=True, exist_ok=True)
    times = np.arange(audio.size) / sample_rate

    plt.figure(figsize=(11, 8))

    plt.subplot(3, 1, 1)
    plt.plot(times, audio, linewidth=0.8, label="Raw")
    plt.plot(times, filtered, linewidth=0.8, alpha=0.8, label="Band-pass filtered")
    plt.title("Waveform Before and After Siren-Band Filtering")
    plt.xlabel("Time (s)")
    plt.ylabel("Amplitude")
    plt.legend(loc="upper right")

    plt.subplot(3, 1, 2)
    magnitude_db = 20 * np.log10(features["magnitude"] + 1e-8)
    plt.pcolormesh(features["times"], features["frequencies"], magnitude_db, shading="gouraud")
    plt.ylim(0, 3000)
    plt.colorbar(label="Magnitude (dB)")
    plt.title("Short-Time Fourier Transform")
    plt.xlabel("Time (s)")
    plt.ylabel("Frequency (Hz)")

    plt.subplot(3, 1, 3)
    plt.plot(features["times"], features["dominant_freq"], label="Dominant siren-band frequency")
    plt.scatter(
        features["times"][features["active"]],
        features["dominant_freq"][features["active"]],
        s=12,
        label="Active siren-like frames",
    )
    plt.ylim(SIREN_BAND[0] - 150, SIREN_BAND[1] + 150)
    plt.title(f"Frequency Track, Detected={result.detected}, Confidence={result.confidence}")
    plt.xlabel("Time (s)")
    plt.ylabel("Frequency (Hz)")
    plt.legend(loc="upper right")

    plt.tight_layout()
    plt.savefig(out_prefix.with_suffix(".png"), dpi=160)
    plt.close()


def analyze_file(input_path: str | Path, out_prefix: str | Path | None = None, make_plot: bool = False) -> DetectionResult:
    sample_rate, audio = load_audio(input_path)
    if audio.size < sample_rate // 2:
        raise ValueError("Audio must be at least 0.5 seconds long.")

    result, features, filtered = detect_siren(audio, sample_rate)

    if out_prefix:
        out_prefix = Path(out_prefix)
        out_prefix.parent.mkdir(parents=True, exist_ok=True)
        out_prefix.with_suffix(".json").write_text(json.dumps(asdict(result), indent=2), encoding="utf-8")
        if make_plot:
            plot_results(audio, filtered, sample_rate, features, result, out_prefix)

    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Detect emergency sirens in WAV audio.")
    parser.add_argument("--input", required=True, help="Path to a WAV file.")
    parser.add_argument("--out", help="Output prefix for JSON and optional plot.")
    parser.add_argument("--plot", action="store_true", help="Write a waveform/spectrogram/frequency-track plot.")
    args = parser.parse_args()

    result = analyze_file(args.input, args.out, args.plot)
    print("SIREN DETECTED" if result.detected else "NO SIREN")
    print(json.dumps(asdict(result), indent=2))


if __name__ == "__main__":
    main()
