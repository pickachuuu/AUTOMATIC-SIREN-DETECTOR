# Automatic Siren Detector

This project detects emergency sirens in WAV audio using classical Signals and Systems methods: sampling, band-pass filtering, STFT, frequency-domain energy, and time-varying frequency tracking.

## Setup

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python scripts/generate_samples.py
npm install
```

## Run

Detect one file:

```powershell
python src/siren_detector.py --input data/siren_clear.wav --plot --out results/demo_siren
```

Evaluate all bundled examples:

```powershell
python src/evaluate.py --manifest data/manifest.csv --out results/evaluation
```

Launch the Tkinter app:

```powershell
python src/siren_app.py
```

The app accepts `.wav` files through drag-and-drop or the file picker and writes GUI outputs under `results/gui_<filename>`.

Launch the Electron app:

```powershell
npm run dev
```

Run the TypeScript detector tests:

```powershell
npm test
```

Build the Electron/Vite app:

```powershell
npm run build
```

The Electron app uses a TypeScript port of the detector and keeps the Python implementation as the reference baseline.

## Theory

Emergency sirens are useful for a Signals and Systems project because they are nonstationary signals: their dominant frequency changes over time in a repeated sweep. The program models this by:

- resampling audio to a fixed sampling rate,
- filtering to the main siren band of `500-1800 Hz`,
- computing a short-time Fourier transform,
- measuring how much energy lies in the siren band,
- tracking whether the dominant frequency repeatedly moves up and down.

The detector avoids machine learning so the result is explainable through course concepts.

## Results to Discuss

The evaluation script reports accuracy, precision, recall, false positives, and false negatives. The generated plots compare the raw waveform, filtered waveform, STFT spectrogram, and siren-band frequency track.

Important limitations:

- horns and alarms may produce false positives if they sweep like a siren,
- distant sirens may be missed if the siren-band energy is too weak,
- music with strong pitch movement can confuse the detector,
- thresholds are tuned for the bundled examples, not every real-world microphone.

## Demo Script

1. Activate `.venv`.
2. Generate samples if needed.
3. Run the detector on `data/siren_clear.wav`.
4. Run the detector on `data/traffic_noise.wav`.
5. Open the generated PNG plots in `results/`.
6. Run the full evaluation and explain the metrics.
