from __future__ import annotations

from pathlib import Path

import numpy as np
from scipy.io import wavfile


SAMPLE_RATE = 16_000
DURATION = 5.0


def normalize(audio: np.ndarray) -> np.ndarray:
    peak = np.max(np.abs(audio))
    if peak > 0:
        audio = audio / peak
    return np.int16(audio * 32767)


def write_wav(path: str, audio: np.ndarray) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    wavfile.write(path, SAMPLE_RATE, normalize(audio))


def siren(amplitude: float = 0.8, noise: float = 0.0) -> np.ndarray:
    t = np.arange(int(SAMPLE_RATE * DURATION)) / SAMPLE_RATE
    sweep = 950 + 450 * np.sin(2 * np.pi * 0.65 * t)
    phase = 2 * np.pi * np.cumsum(sweep) / SAMPLE_RATE
    signal = amplitude * np.sin(phase)
    signal += 0.20 * amplitude * np.sin(2 * phase)
    signal += noise * np.random.default_rng(2).normal(size=t.size)
    return signal


def traffic_noise() -> np.ndarray:
    rng = np.random.default_rng(3)
    t = np.arange(int(SAMPLE_RATE * DURATION)) / SAMPLE_RATE
    low_rumble = 0.45 * np.sin(2 * np.pi * 90 * t) + 0.25 * np.sin(2 * np.pi * 140 * t)
    broadband = 0.30 * rng.normal(size=t.size)
    return low_rumble + broadband


def speech_like() -> np.ndarray:
    rng = np.random.default_rng(4)
    t = np.arange(int(SAMPLE_RATE * DURATION)) / SAMPLE_RATE
    envelope = 0.5 + 0.5 * np.sin(2 * np.pi * 2.2 * t)
    formants = (
        0.45 * np.sin(2 * np.pi * 180 * t)
        + 0.30 * np.sin(2 * np.pi * 430 * t)
        + 0.18 * np.sin(2 * np.pi * 760 * t)
    )
    return envelope * formants + 0.04 * rng.normal(size=t.size)


def music_like() -> np.ndarray:
    t = np.arange(int(SAMPLE_RATE * DURATION)) / SAMPLE_RATE
    notes = [261.63, 329.63, 392.00, 523.25]
    audio = np.zeros_like(t)
    for i, freq in enumerate(notes):
        start = int(i * len(t) / len(notes))
        end = int((i + 1) * len(t) / len(notes))
        audio[start:end] = 0.7 * np.sin(2 * np.pi * freq * t[start:end])
    return audio + 0.15 * np.sin(2 * np.pi * 80 * t)


def horn_like() -> np.ndarray:
    t = np.arange(int(SAMPLE_RATE * DURATION)) / SAMPLE_RATE
    return 0.75 * np.sin(2 * np.pi * 440 * t) + 0.25 * np.sin(2 * np.pi * 880 * t)


def main() -> None:
    write_wav("data/siren_clear.wav", siren())
    write_wav("data/siren_traffic.wav", siren(amplitude=0.62, noise=0.35) + 0.35 * traffic_noise())
    write_wav("data/siren_low_volume.wav", siren(amplitude=0.28, noise=0.10) + 0.50 * traffic_noise())
    write_wav("data/traffic_noise.wav", traffic_noise())
    write_wav("data/speech_like.wav", speech_like())
    write_wav("data/music_like.wav", music_like())
    write_wav("data/horn_like.wav", horn_like())


if __name__ == "__main__":
    main()
