"""Pure metric computations: KPIs, time series, table stats, ROI (no database access).

Services load :mod:`~rv_cloud.metrics.records` from repositories and call these functions,
which keeps the math unit-testable on hand-built event sequences.
"""

from .kpis import summarize, table_stats
from .records import AlertRecord, QueueRecord, SessionRecord, SnapshotPoint
from .roi import RoiInputs, baseline_window, queued_hours, roi_block
from .stats import mean, median, percentile
from .timebuckets import bucket_starts, business_day_range, floor_local

__all__ = [
    "AlertRecord",
    "QueueRecord",
    "RoiInputs",
    "SessionRecord",
    "SnapshotPoint",
    "baseline_window",
    "bucket_starts",
    "business_day_range",
    "floor_local",
    "mean",
    "median",
    "percentile",
    "queued_hours",
    "roi_block",
    "summarize",
    "table_stats",
]
