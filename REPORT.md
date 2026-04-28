# Automatic Siren Detector Report

## Problem and S&S Model

The project detects emergency sirens in WAV audio. This is a real-world safety problem for drivers, cyclists, pedestrians, and people wearing headphones.

The signal-processing model is:

- audio is sampled and normalized,
- a siren-focused band-pass filter highlights `500-1800 Hz`,
- an STFT converts the time-domain signal into a time-frequency representation,
- siren-band energy, dominant frequency, and repeated frequency sweeps are measured,
- a threshold-based classifier decides whether a siren is present.

This uses core Signals and Systems ideas: sampling, filtering, Fourier transforms, frequency response, and time-frequency analysis.

## Current Evaluation

The bundled synthetic-but-realistic WAV examples include clear siren, siren with traffic, low-volume siren, traffic noise, speech-like audio, music-like audio, and horn-like audio.

Latest evaluation:

- Accuracy: `1.000`
- Precision: `1.000`
- Recall: `1.000`
- True positives: `3`
- True negatives: `4`
- False positives: `0`
- False negatives: `0`

Run:

```powershell
.venv\Scripts\Activate.ps1
python src/evaluate.py --manifest data/manifest.csv --out results/evaluation
```

## Discussion

The detector succeeds because emergency sirens are not just loud sounds; they usually contain strong energy in a limited frequency band and a repeating upward/downward frequency sweep. A horn may have strong energy, but it does not sweep. Traffic noise may be loud, but its energy is more broadband and less structured.

The main limitation is that these thresholds are tuned for the bundled examples. Real recordings can vary because of distance, microphone quality, wind, traffic, music, and siren type. A stronger future version could collect more real recordings and tune thresholds against a larger test set.

## Live Demo Flow

1. Activate the virtual environment.
2. Run `python src/siren_detector.py --input data/siren_clear.wav --plot --out results/demo_siren`.
3. Run `python src/siren_detector.py --input data/traffic_noise.wav --plot --out results/demo_traffic`.
4. Open the generated PNG plots and explain the waveform, STFT, and dominant-frequency track.
5. Run the full evaluator and explain the metrics.
