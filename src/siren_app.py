from __future__ import annotations

import os
import queue
import threading
import tkinter as tk
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from tkinter import filedialog

from tkinterdnd2 import DND_FILES, TkinterDnD

from siren_detector import DetectionResult, analyze_file


APP_BG = "#F7F3E8"
PANEL_BG = "#FFF9E8"
SURFACE_BG = "#FFFDF5"
ACCENT_YELLOW = "#FFD63D"
ACCENT_RED = "#FF5A36"
ACCENT_GREEN = "#3CD070"
ACCENT_BLUE = "#6BC5FF"
TEXT_COLOR = "#111111"
MUTED_TEXT = "#353535"
SHADOW_COLOR = "#111111"
BORDER_WIDTH = 3
SHADOW_OFFSET = 7
MAX_HISTORY = 8


@dataclass
class HistoryEntry:
    filename: str
    detected: bool
    confidence: float
    timestamp: str


class BrutalistPanel(tk.Frame):
    def __init__(self, master: tk.Misc, bg_color: str, width: int | None = None, height: int | None = None, **kwargs):
        super().__init__(master, bg=APP_BG, highlightthickness=0, bd=0)
        self.shadow = tk.Frame(self, bg=SHADOW_COLOR, width=width, height=height)
        self.shadow.place(x=SHADOW_OFFSET, y=SHADOW_OFFSET, relwidth=1.0, relheight=1.0)
        self.surface = tk.Frame(
            self,
            bg=bg_color,
            highlightbackground=TEXT_COLOR,
            highlightthickness=BORDER_WIDTH,
            bd=0,
            width=width,
            height=height,
            **kwargs,
        )
        self.surface.place(x=0, y=0, relwidth=1.0, relheight=1.0)


class SirenApp:
    def __init__(self) -> None:
        self.root = TkinterDnD.Tk()
        self.root.title("Automatic Siren Detector")
        self.root.geometry("1340x860")
        self.root.minsize(1180, 760)
        self.root.configure(bg=APP_BG)

        self.selected_file: Path | None = None
        self.latest_plot_path: Path | None = None
        self.latest_json_path: Path | None = None
        self.history: list[HistoryEntry] = []
        self.result_queue: queue.Queue[tuple[str, object]] = queue.Queue()
        self.processing = False

        self.status_text = tk.StringVar(value="Drop a WAV file or browse for one.")
        self.file_text = tk.StringVar(value="No file selected")
        self.result_text = tk.StringVar(value="WAITING FOR INPUT")
        self.confidence_text = tk.StringVar(value="Confidence: --")
        self.metrics_text = tk.StringVar(value="Band ratio: --    Sweep score: --    Persistence: --")
        self.intervals_text = tk.StringVar(value="Detected intervals: --")
        self.output_text = tk.StringVar(value="Plot output: --")
        self.error_text = tk.StringVar(value="")

        self._build_ui()
        self._poll_queue()

    def _font(self, family: str, size: int, weight: str = "normal") -> tuple[str, int, str]:
        return (family, size, weight)

    def _build_ui(self) -> None:
        self.root.grid_columnconfigure(0, weight=1)
        self.root.grid_rowconfigure(1, weight=1)
        self.root.grid_rowconfigure(2, weight=1)

        header = BrutalistPanel(self.root, ACCENT_YELLOW, height=110)
        header.grid(row=0, column=0, sticky="ew", padx=22, pady=(22, 18))
        header.surface.grid_columnconfigure(0, weight=1)
        tk.Label(
            header.surface,
            text="AUTOMATIC SIREN DETECTOR",
            bg=ACCENT_YELLOW,
            fg=TEXT_COLOR,
            font=self._font("Bahnschrift", 24, "bold"),
        ).grid(row=0, column=0, sticky="w", padx=22, pady=(16, 2))
        tk.Label(
            header.surface,
            textvariable=self.status_text,
            bg=ACCENT_YELLOW,
            fg=MUTED_TEXT,
            font=self._font("Segoe UI", 11, "bold"),
        ).grid(row=1, column=0, sticky="w", padx=22, pady=(0, 14))

        upper = tk.Frame(self.root, bg=APP_BG)
        upper.grid(row=1, column=0, sticky="nsew", padx=22)
        upper.grid_columnconfigure(0, weight=4, uniform="upper")
        upper.grid_columnconfigure(1, weight=5, uniform="upper")
        upper.grid_columnconfigure(2, weight=3, uniform="upper")
        upper.grid_rowconfigure(0, weight=1)

        self._build_controls(upper).grid(row=0, column=0, sticky="nsew", padx=(0, 18))
        self._build_dashboard(upper).grid(row=0, column=1, sticky="nsew", padx=(0, 18))
        self._build_history(upper).grid(row=0, column=2, sticky="nsew")

        lower = tk.Frame(self.root, bg=APP_BG)
        lower.grid(row=2, column=0, sticky="nsew", padx=22, pady=(18, 22))
        lower.grid_columnconfigure(0, weight=1)
        lower.grid_rowconfigure(0, weight=1)
        self._build_outputs(lower).grid(row=0, column=0, sticky="nsew")

    def _build_controls(self, master: tk.Misc) -> BrutalistPanel:
        panel = BrutalistPanel(master, PANEL_BG)
        panel.surface.grid_columnconfigure(0, weight=1)

        tk.Label(
            panel.surface,
            text="FILE INPUT",
            bg=PANEL_BG,
            fg=TEXT_COLOR,
            font=self._font("Bahnschrift", 18, "bold"),
        ).grid(row=0, column=0, sticky="w", padx=18, pady=(16, 12))

        self.drop_frame = tk.Frame(
            panel.surface,
            bg=SURFACE_BG,
            highlightbackground=TEXT_COLOR,
            highlightthickness=BORDER_WIDTH,
            bd=0,
            height=250,
        )
        self.drop_frame.grid(row=1, column=0, sticky="ew", padx=18)
        self.drop_frame.grid_propagate(False)
        self.drop_frame.drop_target_register(DND_FILES)
        self.drop_frame.dnd_bind("<<Drop>>", self._handle_drop)

        tk.Label(
            self.drop_frame,
            text="DROP WAV FILE HERE",
            bg=SURFACE_BG,
            fg=TEXT_COLOR,
            font=self._font("Bahnschrift", 22, "bold"),
        ).place(relx=0.5, rely=0.40, anchor="center")
        tk.Label(
            self.drop_frame,
            text="or use the browse button below",
            bg=SURFACE_BG,
            fg=MUTED_TEXT,
            font=self._font("Segoe UI", 11, "bold"),
        ).place(relx=0.5, rely=0.58, anchor="center")

        button_row = tk.Frame(panel.surface, bg=PANEL_BG)
        button_row.grid(row=2, column=0, sticky="ew", padx=18, pady=18)
        button_row.grid_columnconfigure(0, weight=1)
        button_row.grid_columnconfigure(1, weight=1)

        self.browse_button = self._make_button(
            button_row,
            text="BROWSE",
            bg=ACCENT_BLUE,
            command=self._browse_file,
        )
        self.browse_button.grid(row=0, column=0, sticky="ew", padx=(0, 8))

        self.analyze_button = self._make_button(
            button_row,
            text="ANALYZE",
            bg=ACCENT_RED,
            command=self._start_analysis,
            state="disabled",
        )
        self.analyze_button.grid(row=0, column=1, sticky="ew", padx=(8, 0))

        file_panel = tk.Frame(
            panel.surface,
            bg=SURFACE_BG,
            highlightbackground=TEXT_COLOR,
            highlightthickness=BORDER_WIDTH,
            bd=0,
        )
        file_panel.grid(row=3, column=0, sticky="ew", padx=18)
        file_panel.grid_columnconfigure(0, weight=1)
        tk.Label(
            file_panel,
            text="CURRENT FILE",
            bg=SURFACE_BG,
            fg=MUTED_TEXT,
            font=self._font("Segoe UI", 10, "bold"),
        ).grid(row=0, column=0, sticky="w", padx=12, pady=(10, 4))
        tk.Label(
            file_panel,
            textvariable=self.file_text,
            bg=SURFACE_BG,
            fg=TEXT_COLOR,
            justify="left",
            wraplength=330,
            font=self._font("Segoe UI", 11, "bold"),
        ).grid(row=1, column=0, sticky="w", padx=12, pady=(0, 12))

        tk.Label(
            panel.surface,
            textvariable=self.error_text,
            bg=PANEL_BG,
            fg=ACCENT_RED,
            justify="left",
            wraplength=360,
            font=self._font("Segoe UI", 10, "bold"),
        ).grid(row=4, column=0, sticky="w", padx=18, pady=(12, 16))
        return panel

    def _build_dashboard(self, master: tk.Misc) -> BrutalistPanel:
        panel = BrutalistPanel(master, SURFACE_BG)
        panel.surface.grid_columnconfigure(0, weight=1)

        tk.Label(
            panel.surface,
            text="DETECTION DASHBOARD",
            bg=SURFACE_BG,
            fg=TEXT_COLOR,
            font=self._font("Bahnschrift", 18, "bold"),
        ).grid(row=0, column=0, sticky="w", padx=18, pady=(16, 14))

        self.result_card = tk.Frame(
            panel.surface,
            bg=ACCENT_YELLOW,
            highlightbackground=TEXT_COLOR,
            highlightthickness=BORDER_WIDTH,
            bd=0,
            height=210,
        )
        self.result_card.grid(row=1, column=0, sticky="ew", padx=18)
        self.result_card.grid_propagate(False)
        self.result_label = tk.Label(
            self.result_card,
            textvariable=self.result_text,
            bg=ACCENT_YELLOW,
            fg=TEXT_COLOR,
            font=self._font("Bahnschrift", 28, "bold"),
        )
        self.result_label.place(x=18, y=22)
        self.confidence_label = tk.Label(
            self.result_card,
            textvariable=self.confidence_text,
            bg=ACCENT_YELLOW,
            fg=TEXT_COLOR,
            font=self._font("Segoe UI", 14, "bold"),
        )
        self.confidence_label.place(x=18, y=86)
        self.metrics_label = tk.Label(
            self.result_card,
            textvariable=self.metrics_text,
            bg=ACCENT_YELLOW,
            fg=MUTED_TEXT,
            justify="left",
            wraplength=500,
            font=self._font("Segoe UI", 11, "bold"),
        )
        self.metrics_label.place(x=18, y=126)

        intervals_panel = tk.Frame(
            panel.surface,
            bg=PANEL_BG,
            highlightbackground=TEXT_COLOR,
            highlightthickness=BORDER_WIDTH,
            bd=0,
        )
        intervals_panel.grid(row=2, column=0, sticky="ew", padx=18, pady=(18, 0))
        tk.Label(
            intervals_panel,
            text="INTERVALS",
            bg=PANEL_BG,
            fg=TEXT_COLOR,
            font=self._font("Bahnschrift", 15, "bold"),
        ).grid(row=0, column=0, sticky="w", padx=12, pady=(10, 6))
        tk.Label(
            intervals_panel,
            textvariable=self.intervals_text,
            bg=PANEL_BG,
            fg=MUTED_TEXT,
            justify="left",
            wraplength=520,
            font=self._font("Segoe UI", 11, "bold"),
        ).grid(row=1, column=0, sticky="w", padx=12, pady=(0, 12))
        return panel

    def _build_history(self, master: tk.Misc) -> BrutalistPanel:
        panel = BrutalistPanel(master, PANEL_BG)
        panel.surface.grid_columnconfigure(0, weight=1)
        panel.surface.grid_rowconfigure(1, weight=1)

        tk.Label(
            panel.surface,
            text="RECENT RUNS",
            bg=PANEL_BG,
            fg=TEXT_COLOR,
            font=self._font("Bahnschrift", 18, "bold"),
        ).grid(row=0, column=0, sticky="w", padx=18, pady=(16, 12))

        self.history_list = tk.Listbox(
            panel.surface,
            bg=SURFACE_BG,
            fg=TEXT_COLOR,
            highlightbackground=TEXT_COLOR,
            highlightthickness=BORDER_WIDTH,
            bd=0,
            relief="flat",
            selectbackground=ACCENT_YELLOW,
            selectforeground=TEXT_COLOR,
            font=self._font("Segoe UI", 11, "bold"),
        )
        self.history_list.grid(row=1, column=0, sticky="nsew", padx=18, pady=(0, 18))
        self.history_list.insert(tk.END, "No analyses yet")
        return panel

    def _build_outputs(self, master: tk.Misc) -> BrutalistPanel:
        panel = BrutalistPanel(master, SURFACE_BG)
        panel.surface.grid_columnconfigure(0, weight=1)
        panel.surface.grid_columnconfigure(1, weight=0)

        tk.Label(
            panel.surface,
            text="OUTPUTS",
            bg=SURFACE_BG,
            fg=TEXT_COLOR,
            font=self._font("Bahnschrift", 18, "bold"),
        ).grid(row=0, column=0, sticky="w", padx=18, pady=(16, 14))

        self.output_label = tk.Label(
            panel.surface,
            textvariable=self.output_text,
            bg=SURFACE_BG,
            fg=MUTED_TEXT,
            justify="left",
            wraplength=860,
            font=self._font("Segoe UI", 11, "bold"),
        )
        self.output_label.grid(row=1, column=0, sticky="w", padx=18, pady=(0, 18))

        self.open_plot_button = self._make_button(
            panel.surface,
            text="OPEN PLOT",
            bg=ACCENT_GREEN,
            command=self._open_plot,
            state="disabled",
        )
        self.open_plot_button.grid(row=1, column=1, sticky="e", padx=18, pady=(0, 18))
        return panel

    def _make_button(self, master: tk.Misc, text: str, bg: str, command, state: str = "normal") -> tk.Button:
        return tk.Button(
            master,
            text=text,
            command=command,
            state=state,
            bg=bg,
            fg=TEXT_COLOR,
            activebackground=bg,
            activeforeground=TEXT_COLOR,
            relief="flat",
            bd=0,
            padx=16,
            pady=14,
            highlightbackground=TEXT_COLOR,
            highlightthickness=BORDER_WIDTH,
            font=self._font("Bahnschrift", 14, "bold"),
            cursor="hand2",
        )

    def _handle_drop(self, event) -> None:
        path = self.root.tk.splitlist(event.data)[0]
        self._set_selected_file(Path(path))

    def _browse_file(self) -> None:
        file_path = filedialog.askopenfilename(
            title="Choose a WAV file",
            filetypes=[("WAV audio", "*.wav")],
        )
        if file_path:
            self._set_selected_file(Path(file_path))

    def _set_selected_file(self, path: Path) -> None:
        if not path.exists():
            self._show_error("The selected file does not exist.")
            return
        if path.suffix.lower() != ".wav":
            self._show_error("Please choose a WAV file.")
            return

        self.selected_file = path
        self.file_text.set(str(path))
        self.status_text.set("File ready. Run analysis to check for sirens.")
        self.error_text.set("")
        if not self.processing:
            self.analyze_button.configure(state="normal")

    def _show_error(self, message: str) -> None:
        self.error_text.set(message)
        self.status_text.set("Input error. Fix the file selection and try again.")

    def _start_analysis(self) -> None:
        if self.processing or self.selected_file is None:
            return

        self.processing = True
        self.error_text.set("")
        self.status_text.set("Analyzing audio. Generating signal plot and result files.")
        self.result_text.set("ANALYZING...")
        self.confidence_text.set("Confidence: --")
        self.metrics_text.set("Band ratio: --    Sweep score: --    Persistence: --")
        self.intervals_text.set("Detected intervals: --")
        self.output_text.set("Plot output: --")
        self.analyze_button.configure(state="disabled")
        self.open_plot_button.configure(state="disabled")

        selected_file = self.selected_file
        out_prefix = Path("results") / f"gui_{selected_file.stem}"
        worker = threading.Thread(
            target=self._analysis_worker,
            args=(selected_file, out_prefix),
            daemon=True,
        )
        worker.start()

    def _analysis_worker(self, input_path: Path, out_prefix: Path) -> None:
        try:
            result = analyze_file(input_path, out_prefix, make_plot=True)
        except Exception as exc:  # noqa: BLE001
            self.result_queue.put(("error", str(exc)))
            return
        self.result_queue.put(("success", (input_path, out_prefix, result)))

    def _poll_queue(self) -> None:
        try:
            while True:
                message_type, payload = self.result_queue.get_nowait()
                if message_type == "error":
                    self._handle_analysis_error(payload)
                else:
                    self._handle_analysis_success(*payload)
        except queue.Empty:
            pass
        self.root.after(120, self._poll_queue)

    def _handle_analysis_error(self, message: str) -> None:
        self.processing = False
        self.status_text.set("Analysis failed.")
        self.result_text.set("ERROR")
        self._set_result_card_color(ACCENT_RED)
        self.error_text.set(message)
        self.analyze_button.configure(state="normal" if self.selected_file else "disabled")

    def _handle_analysis_success(self, input_path: Path, out_prefix: Path, result: DetectionResult) -> None:
        self.processing = False
        self.latest_plot_path = out_prefix.with_suffix(".png")
        self.latest_json_path = out_prefix.with_suffix(".json")

        detected_bg = ACCENT_RED if result.detected else ACCENT_GREEN
        label_text = "SIREN DETECTED" if result.detected else "NO SIREN"
        self.result_text.set(label_text)
        self._set_result_card_color(detected_bg)
        self.confidence_text.set(f"Confidence: {result.confidence:.3f}")
        self.metrics_text.set(
            f"Band ratio: {result.siren_band_energy_ratio:.3f}    "
            f"Sweep score: {result.sweep_score:.3f}    "
            f"Persistence: {result.persistence:.3f}"
        )
        self.intervals_text.set(f"Detected intervals: {self._format_intervals(result.intervals_seconds)}")
        self.output_text.set(
            f"Plot output: {self.latest_plot_path}    JSON output: {self.latest_json_path}"
        )
        self.status_text.set(f"Analysis complete for {input_path.name}.")
        self.error_text.set("")
        self.analyze_button.configure(state="normal")
        self.open_plot_button.configure(state="normal")
        self._push_history(input_path.name, result)

    def _push_history(self, filename: str, result: DetectionResult) -> None:
        entry = HistoryEntry(
            filename=filename,
            detected=result.detected,
            confidence=result.confidence,
            timestamp=datetime.now().strftime("%H:%M:%S"),
        )
        self.history.insert(0, entry)
        self.history = self.history[:MAX_HISTORY]
        self.history_list.delete(0, tk.END)
        for item in self.history:
            state = "YES" if item.detected else "NO"
        self.history_list.insert(
                tk.END,
                f"{item.timestamp}  {state}  {item.confidence:.3f}  {item.filename}",
            )

    def _set_result_card_color(self, color: str) -> None:
        self.result_card.configure(bg=color)
        self.result_label.configure(bg=color)
        self.confidence_label.configure(bg=color)
        self.metrics_label.configure(bg=color)

    def _open_plot(self) -> None:
        if self.latest_plot_path and self.latest_plot_path.exists():
            os.startfile(self.latest_plot_path)  # type: ignore[attr-defined]

    def _format_intervals(self, intervals: list[tuple[float, float]]) -> str:
        if not intervals:
            return "none"
        return ", ".join(f"{start:.2f}s-{end:.2f}s" for start, end in intervals)

    def run(self) -> None:
        self.root.mainloop()


def main() -> None:
    app = SirenApp()
    app.run()


if __name__ == "__main__":
    main()
