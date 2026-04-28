from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

from siren_detector import analyze_file


def evaluate_manifest(manifest_path: str | Path, out_dir: str | Path) -> dict:
    manifest_path = Path(manifest_path)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    with manifest_path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            rows.append(row)

    results = []
    tp = tn = fp = fn = 0
    for row in rows:
        audio_path = Path(row["path"])
        expected = bool(int(row["label"]))
        result = analyze_file(audio_path, out_dir / audio_path.stem, make_plot=True)
        predicted = result.detected

        if predicted and expected:
            tp += 1
        elif predicted and not expected:
            fp += 1
        elif not predicted and expected:
            fn += 1
        else:
            tn += 1

        results.append(
            {
                "path": str(audio_path),
                "expected": int(expected),
                "predicted": int(predicted),
                "confidence": result.confidence,
                "sweep_score": result.sweep_score,
                "siren_band_energy_ratio": result.siren_band_energy_ratio,
                "persistence": result.persistence,
            }
        )

    total = max(1, tp + tn + fp + fn)
    precision = tp / max(1, tp + fp)
    recall = tp / max(1, tp + fn)
    metrics = {
        "accuracy": round((tp + tn) / total, 3),
        "precision": round(precision, 3),
        "recall": round(recall, 3),
        "true_positives": tp,
        "true_negatives": tn,
        "false_positives": fp,
        "false_negatives": fn,
        "samples": results,
    }

    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    with (out_dir / "summary.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=results[0].keys())
        writer.writeheader()
        writer.writerows(results)

    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate siren detector on a labeled manifest.")
    parser.add_argument("--manifest", default="data/manifest.csv")
    parser.add_argument("--out", default="results/evaluation")
    args = parser.parse_args()

    metrics = evaluate_manifest(args.manifest, args.out)
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
