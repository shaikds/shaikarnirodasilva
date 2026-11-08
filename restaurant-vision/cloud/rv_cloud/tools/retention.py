"""Apply the data retention policy once: ``python -m rv_cloud.tools.retention``.

Deletes raw edge events older than ``RV_RETENTION_RAW_EVENTS_DAYS`` (default 90) and derived
metrics older than ``RV_RETENTION_METRICS_DAYS`` (default 400); see
:mod:`rv_cloud.services.retention`. The app also runs this periodically
(``RV_RETENTION_INTERVAL_S``); use this tool for cron jobs, one-off clean-ups or a dry run.

Options override the settings: ``--database-url``, ``--raw-events-days``, ``--metrics-days``;
``--dry-run`` only counts.
"""

import argparse

from ..clock import SystemClock
from ..config import Settings
from ..db import create_db_engine, create_session_factory
from ..services.retention import RetentionResult, apply_retention


def run(
    settings: Settings,
    *,
    raw_events_days: float | None = None,
    metrics_days: float | None = None,
    dry_run: bool = False,
    now: float | None = None,
) -> RetentionResult:
    engine = create_db_engine(settings.database_url)
    try:
        with create_session_factory(engine)() as session:
            result = apply_retention(
                session,
                now=SystemClock().now() if now is None else now,
                raw_events_days=raw_events_days or settings.retention_raw_events_days,
                metrics_days=metrics_days or settings.retention_metrics_days,
                dry_run=dry_run,
            )
            if not dry_run:
                session.commit()
    finally:
        engine.dispose()
    return result


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else None)
    parser.add_argument("--database-url", help="defaults to RV_DATABASE_URL")
    parser.add_argument("--raw-events-days", type=float, help="RV_RETENTION_RAW_EVENTS_DAYS")
    parser.add_argument("--metrics-days", type=float, help="RV_RETENTION_METRICS_DAYS")
    parser.add_argument("--dry-run", action="store_true", help="count only, delete nothing")
    args = parser.parse_args(argv)
    settings = Settings(database_url=args.database_url) if args.database_url else Settings()
    result = run(
        settings,
        raw_events_days=args.raw_events_days,
        metrics_days=args.metrics_days,
        dry_run=args.dry_run,
    )
    verb = "would delete" if result.dry_run else "deleted"
    for table, count in result.deleted.items():
        print(f"{verb} {count:>8} {table}")
    print(f"{verb} {result.total:>8} rows in total")


if __name__ == "__main__":
    main()
