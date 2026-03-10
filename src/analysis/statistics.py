"""Statistical analysis of experiment results."""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class RunStatistics:
    """Statistics from multiple runs of the same experiment."""
    mean: float = 0.0
    median: float = 0.0
    std: float = 0.0
    min_val: float = 0.0
    max_val: float = 0.0
    ci_lower: float = 0.0
    ci_upper: float = 0.0
    n: int = 0


def compute_statistics(values: list[float], confidence: float = 0.95) -> RunStatistics:
    """Compute descriptive statistics and confidence interval.

    Uses t-distribution for small samples.
    """
    n = len(values)
    if n == 0:
        return RunStatistics()

    sorted_v = sorted(values)
    mean = sum(values) / n

    if n == 1:
        return RunStatistics(
            mean=mean, median=mean, std=0.0,
            min_val=mean, max_val=mean,
            ci_lower=mean, ci_upper=mean, n=1,
        )

    variance = sum((x - mean) ** 2 for x in values) / (n - 1)
    std = math.sqrt(variance)
    se = std / math.sqrt(n)

    # Median
    if n % 2 == 0:
        median = (sorted_v[n // 2 - 1] + sorted_v[n // 2]) / 2
    else:
        median = sorted_v[n // 2]

    # t-critical value approximation for common confidence levels
    t_crit = _t_critical(confidence, n - 1)
    ci_lower = mean - t_crit * se
    ci_upper = mean + t_crit * se

    return RunStatistics(
        mean=mean, median=median, std=std,
        min_val=sorted_v[0], max_val=sorted_v[-1],
        ci_lower=ci_lower, ci_upper=ci_upper, n=n,
    )


def compute_speedup(baseline_times: list[float], improved_times: list[float]) -> float:
    """Compute mean speedup ratio."""
    if not baseline_times or not improved_times:
        return 0.0
    mean_base = sum(baseline_times) / len(baseline_times)
    mean_improved = sum(improved_times) / len(improved_times)
    if mean_improved == 0:
        return float('inf')
    return mean_base / mean_improved


def _t_critical(confidence: float, df: int) -> float:
    """Approximate t-critical value. For exact values, use scipy.stats.t.ppf."""
    # Common values for 95% confidence
    t_table_95 = {
        1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
        6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
        15: 2.131, 20: 2.086, 25: 2.060, 30: 2.042,
    }
    if confidence != 0.95:
        return 2.0  # rough approximation
    if df in t_table_95:
        return t_table_95[df]
    if df > 30:
        return 1.96  # normal approximation
    # Linear interpolation
    keys = sorted(t_table_95.keys())
    for i in range(len(keys) - 1):
        if keys[i] < df < keys[i + 1]:
            ratio = (df - keys[i]) / (keys[i + 1] - keys[i])
            return t_table_95[keys[i]] * (1 - ratio) + t_table_95[keys[i + 1]] * ratio
    return 2.0
