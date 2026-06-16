"""
Matplotlib chart factory — all charts returned as PNG bytes for embedding
in PDF and Excel reports.
"""
from __future__ import annotations

import io
from typing import Optional

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mtick
from matplotlib.colors import LinearSegmentedColormap
import numpy as np
import pandas as pd

# ── Themes ────────────────────────────────────────────────────────────────────

_DARK = {
    "fig": "#0D1117", "ax": "#161B22", "text": "#E6EDF3",
    "grid": "#21262D", "accent": "#00D4FF", "gold": "#F0C040",
    "green": "#3FB950", "red": "#F85149", "muted": "#8B949E",
    "surface": "#1E2A3A",
}
_LIGHT = {
    "fig": "#FFFFFF", "ax": "#F8F9FA", "text": "#1A1A2E",
    "grid": "#DEE2E6", "accent": "#1E3A5F", "gold": "#B8860B",
    "green": "#28A745", "red": "#DC3545", "muted": "#6C757D",
    "surface": "#EEF2FF",
}


def _theme(name: str) -> dict:
    return _DARK if name == "dark" else _LIGHT


def _setup_fig(w: float, h: float, t: dict):
    fig, ax = plt.subplots(figsize=(w, h))
    fig.patch.set_facecolor(t["fig"])
    ax.set_facecolor(t["ax"])
    return fig, ax


def _style_ax(ax, t: dict, title: str = "", xlabel: str = "", ylabel: str = ""):
    ax.tick_params(colors=t["muted"], labelsize=7.5)
    for spine in ["top", "right"]:
        ax.spines[spine].set_visible(False)
    ax.spines["bottom"].set_color(t["grid"])
    ax.spines["left"].set_color(t["grid"])
    ax.grid(True, color=t["grid"], linewidth=0.5, alpha=0.7)
    if title:
        ax.set_title(title, color=t["text"], fontsize=9, fontweight="bold", pad=7)
    if xlabel:
        ax.set_xlabel(xlabel, color=t["muted"], fontsize=8)
    if ylabel:
        ax.set_ylabel(ylabel, color=t["muted"], fontsize=8)


def _to_bytes(fig, t: dict) -> bytes:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight", facecolor=t["fig"])
    plt.close(fig)
    buf.seek(0)
    return buf.read()


# ── Individual Charts ─────────────────────────────────────────────────────────

def equity_curve(
    equity: pd.Series,
    benchmark: Optional[pd.Series] = None,
    theme: str = "light",
    title: str = "Portfolio Performance",
) -> bytes:
    t = _theme(theme)
    fig, ax = _setup_fig(11, 4.5, t)

    if equity.empty:
        _to_bytes(fig, t)
        return b""

    base = equity.iloc[0]
    norm = equity / base * 100

    ax.plot(norm.index, norm.values, color=t["accent"], linewidth=1.8, label="Portfolio", zorder=3)
    ax.fill_between(norm.index, 100, norm.values,
                    where=norm.values >= 100, color=t["green"], alpha=0.12)
    ax.fill_between(norm.index, 100, norm.values,
                    where=norm.values < 100, color=t["red"], alpha=0.12)
    ax.axhline(100, color=t["muted"], linewidth=0.6, linestyle=":")

    if benchmark is not None and not benchmark.empty:
        common = equity.index.intersection(benchmark.index)
        if len(common) > 1:
            nb = benchmark.loc[common] / benchmark.loc[common].iloc[0] * 100
            ax.plot(nb.index, nb.values, color=t["gold"], linewidth=1.3,
                    linestyle="--", alpha=0.85, label="Benchmark")

    _style_ax(ax, t, title, ylabel="Value (Base = 100)")
    ax.legend(loc="upper left", framealpha=0, labelcolor=t["text"], fontsize=8)
    ax.yaxis.set_major_formatter(mtick.FormatStrFormatter("%.0f"))
    plt.tight_layout()
    return _to_bytes(fig, t)


def drawdown(dd: pd.Series, theme: str = "light") -> bytes:
    t = _theme(theme)
    fig, ax = _setup_fig(11, 3.5, t)
    if not dd.empty:
        pct = dd * 100
        ax.fill_between(pct.index, pct.values, 0, color=t["red"], alpha=0.55)
        ax.plot(pct.index, pct.values, color=t["red"], linewidth=0.9)
        ax.set_ylim(pct.min() * 1.15, 1)
        ax.axhline(0, color=t["muted"], linewidth=0.5)
    _style_ax(ax, t, "Drawdown", ylabel="Drawdown (%)")
    ax.yaxis.set_major_formatter(mtick.PercentFormatter())
    plt.tight_layout()
    return _to_bytes(fig, t)


def rolling_metrics(
    rolling_sharpe: pd.Series,
    rolling_vol: pd.Series,
    theme: str = "light",
) -> bytes:
    t = _theme(theme)
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(11, 5.5), sharex=True)
    fig.patch.set_facecolor(t["fig"])

    for ax in (ax1, ax2):
        ax.set_facecolor(t["ax"])

    rs = rolling_sharpe.dropna()
    if not rs.empty:
        ax1.plot(rs.index, rs.values, color=t["accent"], linewidth=1.3)
        ax1.axhline(1.0, color=t["green"], linewidth=0.7, linestyle="--", alpha=0.7)
        ax1.axhline(0, color=t["red"], linewidth=0.6, linestyle="-", alpha=0.5)
        ax1.fill_between(rs.index, 0, rs.values,
                         where=rs.values >= 0, color=t["green"], alpha=0.08)
        ax1.fill_between(rs.index, 0, rs.values,
                         where=rs.values < 0, color=t["red"], alpha=0.08)
    _style_ax(ax1, t, "Rolling 30-Day Sharpe Ratio", ylabel="Sharpe")

    rv = rolling_vol.dropna()
    if not rv.empty:
        ax2.plot(rv.index, rv.values * 100, color=t["gold"], linewidth=1.3)
        ax2.fill_between(rv.index, rv.values * 100, color=t["gold"], alpha=0.12)
    _style_ax(ax2, t, "Rolling 30-Day Annualized Volatility", ylabel="Vol (%)")
    ax2.yaxis.set_major_formatter(mtick.PercentFormatter())

    fig.tight_layout()
    return _to_bytes(fig, t)


def monthly_heatmap(monthly_df: pd.DataFrame, theme: str = "light") -> bytes:
    if monthly_df.empty:
        return b""
    t = _theme(theme)

    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    plot_df = monthly_df.reindex(columns=range(1, 13)) * 100

    h = max(2.5, len(plot_df) * 0.55)
    fig, ax = plt.subplots(figsize=(12, h))
    fig.patch.set_facecolor(t["fig"])
    ax.set_facecolor(t["ax"])

    cmap = LinearSegmentedColormap.from_list(
        "rg", [t["red"], "#FFFFFF" if theme == "light" else "#161B22", t["green"]]
    )

    data = plot_df.values.astype(float)
    finite = data[np.isfinite(data)]
    vmax = max(abs(finite).max(), 3) if finite.size > 0 else 5

    im = ax.imshow(data, cmap=cmap, aspect="auto", vmin=-vmax, vmax=vmax)

    ax.set_xticks(range(12))
    ax.set_xticklabels(months, color=t["text"], fontsize=8.5)
    ax.set_yticks(range(len(plot_df)))
    ax.set_yticklabels(plot_df.index.astype(str), color=t["text"], fontsize=8.5)

    for y in range(len(plot_df)):
        for x in range(12):
            val = plot_df.iloc[y, x]
            if not np.isnan(val):
                txt_c = "white" if abs(val) > vmax * 0.55 else t["text"]
                ax.text(x, y, f"{val:.1f}%", ha="center", va="center",
                        fontsize=7.5, color=txt_c, fontweight="bold")

    ax.set_title("Monthly Returns (%)", color=t["text"], fontsize=10, fontweight="bold", pad=8)
    for spine in ax.spines.values():
        spine.set_visible(False)
    plt.colorbar(im, ax=ax, shrink=0.7, label="Return %")
    plt.tight_layout()
    return _to_bytes(fig, t)


def return_histogram(daily_returns: pd.Series, theme: str = "light") -> bytes:
    if daily_returns.empty:
        return b""
    t = _theme(theme)
    fig, ax = _setup_fig(7, 3.5, t)

    pct = daily_returns * 100
    pos = pct[pct >= 0]
    neg = pct[pct < 0]

    if not neg.empty:
        ax.hist(neg.values, bins=40, color=t["red"], alpha=0.75, edgecolor="none", label="Negative")
    if not pos.empty:
        ax.hist(pos.values, bins=40, color=t["green"], alpha=0.75, edgecolor="none", label="Positive")

    ax.axvline(0, color=t["muted"], linewidth=0.8, linestyle="--")
    ax.axvline(float(pct.mean()), color=t["accent"], linewidth=1.2,
               label=f"Mean {pct.mean():.2f}%")

    _style_ax(ax, t, "Daily Return Distribution", xlabel="Daily Return (%)", ylabel="Frequency")
    ax.legend(framealpha=0, labelcolor=t["text"], fontsize=8)
    plt.tight_layout()
    return _to_bytes(fig, t)


def annual_returns_bar(
    annual: pd.Series,
    benchmark_annual: Optional[pd.Series] = None,
    theme: str = "light",
) -> bytes:
    if annual.empty:
        return b""
    t = _theme(theme)
    fig, ax = _setup_fig(10, 3.5, t)

    vals = annual.values * 100
    try:
        years = annual.index.year
    except AttributeError:
        years = annual.index

    x = np.arange(len(years))
    bw = 0.38 if benchmark_annual is not None else 0.6

    bar_colors = [t["green"] if v >= 0 else t["red"] for v in vals]
    bars = ax.bar(x - (bw / 2 if benchmark_annual is not None else 0),
                  vals, bw, color=bar_colors, alpha=0.85, label="Portfolio")

    if benchmark_annual is not None and not benchmark_annual.empty:
        bv = benchmark_annual.values * 100
        bx = x[:len(bv)]
        ax.bar(bx + bw / 2, bv, bw, color=t["gold"], alpha=0.65, label="Benchmark")

    ax.set_xticks(x)
    ax.set_xticklabels(years, rotation=30, ha="right", fontsize=8)
    ax.axhline(0, color=t["muted"], linewidth=0.6)

    for bar, v in zip(bars, vals):
        ax.text(bar.get_x() + bar.get_width() / 2,
                v + (0.4 if v >= 0 else -1.2),
                f"{v:.1f}%", ha="center",
                va="bottom" if v >= 0 else "top",
                fontsize=7, color=t["text"])

    _style_ax(ax, t, "Annual Returns", ylabel="Return (%)")
    ax.yaxis.set_major_formatter(mtick.PercentFormatter())
    if benchmark_annual is not None:
        ax.legend(framealpha=0, labelcolor=t["text"], fontsize=8)
    plt.tight_layout()
    return _to_bytes(fig, t)


def correlation_heatmap(corr_df: pd.DataFrame, theme: str = "light") -> bytes:
    if corr_df.empty or len(corr_df) < 2:
        return b""
    t = _theme(theme)
    n = len(corr_df)
    sz = max(5, n * 0.9)
    fig, ax = plt.subplots(figsize=(sz, sz))
    fig.patch.set_facecolor(t["fig"])
    ax.set_facecolor(t["ax"])

    cmap = LinearSegmentedColormap.from_list(
        "corr", [t["red"], "#FFFFFF" if theme == "light" else "#161B22", t["green"]]
    )
    im = ax.imshow(corr_df.values, cmap=cmap, vmin=-1, vmax=1)

    labels = list(corr_df.columns)
    ax.set_xticks(range(n))
    ax.set_yticks(range(n))
    ax.set_xticklabels(labels, rotation=45, ha="right", color=t["text"], fontsize=8)
    ax.set_yticklabels(labels, color=t["text"], fontsize=8)

    for i in range(n):
        for j in range(n):
            v = corr_df.iloc[i, j]
            txt_c = "white" if abs(v) > 0.55 else t["text"]
            ax.text(j, i, f"{v:.2f}", ha="center", va="center",
                    fontsize=7.5 if n <= 7 else 6, color=txt_c)

    ax.set_title("Asset Correlation Matrix", color=t["text"], fontsize=10, fontweight="bold", pad=8)
    for spine in ax.spines.values():
        spine.set_visible(False)
    plt.tight_layout()
    return _to_bytes(fig, t)


def build_all_charts(m, theme: str = "light") -> dict:
    """Generate all charts for a report, return dict of name → PNG bytes."""
    import logging
    _log = logging.getLogger(__name__)
    charts = {}

    def _safe(key, fn, *args):
        try:
            charts[key] = fn(*args)
        except Exception as e:
            _log.warning(f"Chart '{key}' failed: {e}")
            charts[key] = b""

    bench_eq = m.benchmark_curve if (isinstance(m.benchmark_curve, pd.Series) and not m.benchmark_curve.empty) else None
    bench_ann = m.benchmark_annual if (isinstance(m.benchmark_annual, pd.Series) and not m.benchmark_annual.empty) else None

    _safe("equity",      equity_curve,       m.equity_curve, bench_eq, theme)
    _safe("drawdown",    drawdown,            m.drawdown_curve, theme)
    _safe("rolling",     rolling_metrics,     m.rolling_sharpe, m.rolling_vol, theme)
    _safe("heatmap",     monthly_heatmap,     m.monthly_returns_table, theme)
    _safe("histogram",   return_histogram,    m.daily_returns, theme)
    _safe("annual",      annual_returns_bar,  m.annual_returns, bench_ann, theme)
    _safe("correlation", correlation_heatmap, m.correlation_matrix, theme)
    return charts
