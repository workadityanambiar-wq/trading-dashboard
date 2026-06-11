"""Signal generation for pair trading."""
from dataclasses import dataclass
from typing import Literal

SignalType = Literal["long_spread", "short_spread", "exit", "neutral"]


@dataclass
class Signal:
    signal: SignalType
    z_score: float
    entry_threshold: float
    exit_threshold: float
    stop_threshold: float
    description: str
    color: str  # for UI badge


def get_signal(
    z_score: float,
    entry_threshold: float = 2.0,
    exit_threshold: float = 0.5,
    stop_threshold: float = 3.5,
    regime: str = "mean_reverting",
) -> Signal:
    """
    Entry:   z < -entry  → LONG spread  (buy A, sell B)
             z > +entry  → SHORT spread (sell A, buy B)
    Exit:    |z| < exit  → close position
    Stop:    |z| > stop  → stop-loss (spread diverging badly)
    Crisis regime overrides all to neutral.
    """
    if regime == "crisis":
        return Signal("neutral", z_score, entry_threshold, exit_threshold,
                      stop_threshold, "Crisis regime — all trades suspended", "gray")

    # Widen thresholds in high-vol environment
    if regime == "high_vol":
        entry_threshold = min(entry_threshold * 1.25, 3.0)
        stop_threshold  = min(stop_threshold  * 1.10, 4.5)

    if abs(z_score) > stop_threshold:
        return Signal("neutral", z_score, entry_threshold, exit_threshold,
                      stop_threshold, f"Stop zone |z|={abs(z_score):.2f}", "red")

    if z_score < -entry_threshold:
        return Signal("long_spread", z_score, entry_threshold, exit_threshold,
                      stop_threshold, f"Long spread z={z_score:.2f}", "emerald")

    if z_score > entry_threshold:
        return Signal("short_spread", z_score, entry_threshold, exit_threshold,
                      stop_threshold, f"Short spread z={z_score:.2f}", "red")

    if abs(z_score) < exit_threshold:
        return Signal("exit", z_score, entry_threshold, exit_threshold,
                      stop_threshold, f"Exit zone |z|={abs(z_score):.2f}", "blue")

    return Signal("neutral", z_score, entry_threshold, exit_threshold,
                  stop_threshold, f"Neutral z={z_score:.2f}", "gray")
