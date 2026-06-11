"""
ML layer: probability of mean reversion for a pair.
Trains a GradientBoostingClassifier on the pair's own spread history.

Features: z_score, abs_z, spread_vol, spread_momentum, rolling_corr
Target:   spread reverts to |z| < 0.5 within max(5, 2×half_life) days.
Falls back to an analytical estimate if sklearn is unavailable or training fails.
"""
import warnings
import numpy as np
import pandas as pd
from dataclasses import dataclass, field


@dataclass
class MLResult:
    probability: float
    feature_importances: dict = field(default_factory=dict)
    n_train_samples: int = 0
    model_type: str = "analytical"


def _make_dataset(
    z: np.ndarray,
    corr: np.ndarray,
    horizon: int,
    window: int = 20,
) -> tuple[np.ndarray, np.ndarray] | tuple[None, None]:
    n = len(z)
    if n < window + horizon + 10:
        return None, None

    X, y = [], []
    for i in range(window, n - horizon):
        if np.isnan(z[i]):
            continue
        z_win = z[max(0, i - window):i]
        if np.any(np.isnan(z_win)):
            continue
        z_fut = z[i:i + horizon]
        if np.any(np.isnan(z_fut)):
            continue

        feat = [
            float(z[i]),
            float(abs(z[i])),
            float(np.std(z_win)),
            float(z[i] - np.mean(z_win)),
            float(corr[i]) if i < len(corr) and not np.isnan(corr[i]) else 0.5,
        ]
        X.append(feat)
        y.append(int(np.any(np.abs(z_fut) < 0.5)))

    if len(X) < 50 or len(set(y)) < 2:
        return None, None
    return np.array(X), np.array(y)


def compute_ml_probability(
    z_score_series: np.ndarray,
    prices1: pd.Series,
    prices2: pd.Series,
    half_life: float,
    current_z: float,
) -> MLResult:
    """Train GBM on pair history and return P(mean reversion)."""
    horizon = max(5, min(int(2 * half_life), 30))

    # Rolling 30-day return correlation
    df = pd.DataFrame({
        "r1": prices1.pct_change(),
        "r2": prices2.pct_change(),
    }).dropna()
    rc = df["r1"].rolling(30).corr(df["r2"])
    min_len = min(len(z_score_series), len(rc))
    z    = z_score_series[-min_len:]
    corr = rc.values[-min_len:]

    X, y = _make_dataset(z, corr, horizon)
    if X is None:
        return _analytical(current_z, half_life)

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            from sklearn.ensemble import GradientBoostingClassifier
            from sklearn.preprocessing import StandardScaler

        scaler = StandardScaler()
        X_s = scaler.fit_transform(X)
        clf = GradientBoostingClassifier(
            n_estimators=100, max_depth=3, learning_rate=0.05,
            subsample=0.8, random_state=42,
        )
        clf.fit(X_s, y)

        z_win = z[-20:] if len(z) >= 20 else z
        feat_now = np.array([[
            current_z, abs(current_z),
            float(np.std(z_win)),
            float(current_z - np.mean(z_win)),
            float(corr[-1]) if len(corr) > 0 and not np.isnan(corr[-1]) else 0.5,
        ]])
        prob = float(clf.predict_proba(scaler.transform(feat_now))[0, 1])

        names = ["z_score", "abs_z", "spread_vol", "spread_mom", "rolling_corr"]
        return MLResult(
            probability=prob,
            feature_importances=dict(zip(names, clf.feature_importances_.tolist())),
            n_train_samples=len(X),
            model_type="GradientBoosting",
        )
    except ImportError:
        return _analytical(current_z, half_life)
    except Exception:
        return _analytical(current_z, half_life)


def _analytical(z: float, half_life: float) -> MLResult:
    """Analytical fallback probability estimate."""
    az = abs(z)
    if   az < 1.0: base = 0.40
    elif az < 2.0: base = 0.55
    elif az < 3.0: base = 0.65
    else:          base = 0.50  # very extreme → possible breakdown

    if   half_life > 60: base *= 0.70
    elif half_life > 30: base *= 0.85

    return MLResult(probability=float(np.clip(base, 0.0, 1.0)), model_type="analytical")
