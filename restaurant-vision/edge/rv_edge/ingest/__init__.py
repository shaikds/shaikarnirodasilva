"""Camera ingest: frame sources (RTSP, file, simulated), ONVIF discovery, RTSP URL templates.

Frames live only in RAM; nothing here writes images to disk.
"""

from .discovery import DiscoveredCamera, discover, parse_probe_matches
from .factory import build_source
from .file import FileSource
from .rtsp import RtspSource, next_backoff
from .rtsp_templates import BRANDS, guess_brand, redact_url, rtsp_url
from .stats import RateMeter, SourceStats, StatsSource, classify_health

__all__ = [
    "BRANDS",
    "DiscoveredCamera",
    "FileSource",
    "RateMeter",
    "RtspSource",
    "SourceStats",
    "StatsSource",
    "build_source",
    "classify_health",
    "discover",
    "guess_brand",
    "next_backoff",
    "parse_probe_matches",
    "redact_url",
    "rtsp_url",
]
