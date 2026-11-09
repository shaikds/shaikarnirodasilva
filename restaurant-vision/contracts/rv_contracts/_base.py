"""Shared building blocks: base model, identifier types and the schema version.

Every serialized contract model derives from :class:`ContractModel`:

* ``extra="forbid"``: unknown fields are rejected, so contract drift between components fails
  loudly instead of silently dropping data (and secrets such as RTSP URLs can never ride along).
* ``frozen=True``: contract objects are immutable values. To change one, validate a new one
  (``Model.model_validate({**old.model_dump(), "field": new})``); ``model_copy(update=...)``
  skips validation and should not be used for contract objects.
* ``allow_inf_nan=False``: every float must be JSON-safe.
* Field docstrings become JSON Schema descriptions (and therefore TS doc comments).
"""

from typing import Annotated, Final

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

SCHEMA_VERSION: Final = "1.2"
"""Contract schema version ``MAJOR.MINOR``. Additive, optional changes bump MINOR; anything a
reader of the previous version could not parse bumps MAJOR. Readers accept any MINOR of their
own MAJOR.

History: 1.0 initial. 1.1 (additive, all optional): ``TableStateChanged.since_ts``,
``AlertRaised``/``AlertView.condition_since_ts``, ``EdgeHeartbeat``/``DeviceStatus.local_url``,
``LiveSnapshotMessage``, ``AlertPush``, ``WsCloseCode`` and the ``queue_wait`` /
``response_time_p90`` time series."""

SCHEMA_MAJOR: Final = int(SCHEMA_VERSION.split(".", 1)[0])

ID_PATTERN: Final = r"^[A-Za-z0-9][A-Za-z0-9_.:\-]{0,63}$"
UUID7_PATTERN: Final = r"^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"


def _check_schema_major(value: str) -> str:
    major = int(value.split(".", 1)[0])
    if major != SCHEMA_MAJOR:
        raise ValueError(
            f"unsupported schema_version {value!r}: this reader supports {SCHEMA_MAJOR}.x"
        )
    return value


SchemaVersion = Annotated[
    str, StringConstraints(pattern=r"^\d+\.\d+$"), AfterValidator(_check_schema_major)
]
"""``MAJOR.MINOR`` string; the major version must equal :data:`SCHEMA_MAJOR`."""

Id = Annotated[str, StringConstraints(pattern=ID_PATTERN)]
"""Opaque identifier (site, camera, table, zone, alert, session, device, user ...): 1-64 chars,
ASCII letters, digits and ``_ . : -``, starting with a letter or digit. UUID strings fit."""

EventId = Annotated[str, StringConstraints(pattern=UUID7_PATTERN)]
"""Canonical lowercase UUIDv7 string (see :func:`rv_contracts.new_event_id`)."""

Label = Annotated[str, StringConstraints(min_length=1, max_length=64)]
"""Human-readable short text shown in UIs (any script, e.g. Hebrew)."""

EpochSeconds = Annotated[float, Field(ge=0)]
"""Unix epoch seconds (UTC), fractional."""

Seconds = Annotated[float, Field(ge=0)]
"""A non-negative duration in seconds."""

Count = Annotated[int, Field(ge=0)]
"""A non-negative integer count."""


class ContractModel(BaseModel):
    """Base class of every serialized contract model (see module docstring)."""

    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        allow_inf_nan=False,
        use_attribute_docstrings=True,
        json_schema_serialization_defaults_required=True,
    )
