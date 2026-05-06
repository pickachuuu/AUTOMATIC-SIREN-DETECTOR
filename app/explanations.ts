import type { RealtimeEvent } from "./realtime";

export function formatHighlightIntervals(intervals: Array<[number, number]>, limit = 3) {
  if (intervals.length === 0) {
    return "none";
  }

  const visible = intervals.slice(0, limit).map(([start, end]) => `${start.toFixed(2)}s-${end.toFixed(2)}s`);
  const hidden = intervals.length - visible.length;
  return hidden > 0 ? `${visible.join(", ")} +${hidden} more` : visible.join(", ");
}

export function explainRealtimeEvent(event: RealtimeEvent) {
  const { analysis, sweepEvidence } = event;
  const confidence = analysis.confidence.toFixed(3);
  const bandRatio = analysis.sirenBandEnergyRatio.toFixed(3);
  const sweepScore = analysis.sweepScore.toFixed(3);
  const persistence = analysis.persistence.toFixed(3);
  const span = Math.round(sweepEvidence.freqSpan);
  const jump = Math.round(sweepEvidence.jumpyRatio * 100);
  const intervals = formatHighlightIntervals(analysis.intervalsSeconds);

  return {
    title: "Why this was marked as a siren",
    summary: `The detector saw repeated siren-band motion during ${intervals}. Confidence was ${confidence}, with sweep score ${sweepScore} and persistence ${persistence}.`,
    bullets: [
      `Energy concentrated in the 500-1800 Hz siren band; band ratio was ${bandRatio}.`,
      `The dominant frequency swept across about ${span} Hz and reversed ${sweepEvidence.reversals} times.`,
      `The sweep track was stable enough for realtime mode; only ${jump}% of steps were jumpy.`
    ],
    fact:
      "Signals fact: the STFT turns a changing siren pitch into a visible time-frequency trace, so a sweep appears as a moving ridge instead of one static FFT peak."
  };
}
