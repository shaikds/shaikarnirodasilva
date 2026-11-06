"""Export every public contract model as one JSON Schema document (for TS type generation).

Usage::

    python -m rv_contracts.schema_export web/packages/shared/src/contracts/schema.json
    python -m rv_contracts.schema_export --check web/packages/shared/src/contracts/schema.json

``--check`` exits 1 if the file is missing or out of date (for CI).

Document shape (JSON Schema 2020-12):

* ``$defs`` holds every public model, enum and union (``EdgeEvent``, ``EdgeCommand``) under its
  Python name.
* The root is an object whose properties reference every definition, so that
  ``json-schema-to-typescript`` emits a named type for each of them without extra options.
* Schemas describe the **serialized** form (what is on the wire): fields with defaults are
  listed as required because they are always present in output. Partial-update models
  (``SiteSettingsPatch``, ``UserUpdate``) keep their fields optional.
* TS-friendly tweaks: no per-property ``title`` (avoids spurious named aliases), homogeneous
  tuples such as ``Point`` are emitted as fixed-length arrays (``items`` +
  ``minItems``/``maxItems``) so they become ``[number, number]``, and a ``$ref`` carrying a
  description is wrapped in ``allOf`` so the referenced type keeps its name.
* Validation rules that JSON Schema cannot express (cross-field checks, polygon >= 3 points
  with non-zero area) live only in the Python models.
"""

import argparse
import json
import sys
from collections.abc import Sequence
from enum import Enum
from pathlib import Path
from typing import Any

from pydantic import BaseModel, TypeAdapter
from pydantic.json_schema import GenerateJsonSchema, JsonSchemaMode, JsonSchemaValue
from pydantic_core import core_schema

from . import api, config, events, geometry
from ._base import SCHEMA_VERSION, ContractModel

_UNIONS: dict[str, Any] = {"EdgeEvent": events.EdgeEvent, "EdgeCommand": api.EdgeCommand}
_EXCLUDED: frozenset[type] = frozenset(
    {ContractModel, events.EdgeEventBase, api.EdgeCommandBase}
)


class _TsFriendlyGenerator(GenerateJsonSchema):
    def field_title_should_be_set(self, schema: Any) -> bool:  # CoreSchemaOrField is private
        return False

    def tuple_schema(self, schema: core_schema.TupleSchema) -> JsonSchemaValue:
        json_schema = super().tuple_schema(schema)
        prefix = json_schema.get("prefixItems")
        if prefix and "items" not in json_schema and all(item == prefix[0] for item in prefix):
            del json_schema["prefixItems"]
            json_schema["items"] = prefix[0]
        return json_schema


def _wrap_ref_siblings(node: Any) -> Any:
    """Rewrite ``{"$ref": X, "description": ...}`` as ``{"allOf": [{"$ref": X}], ...}``.

    json-schema-to-typescript turns a ``$ref`` with sibling keywords into a numbered copy of the
    referenced type (``Estimate2``); wrapped in ``allOf`` it keeps the original name and the
    description. ``default`` next to a ``$ref`` is dropped (it only adds ``& string`` noise).
    """
    if isinstance(node, list):
        return [_wrap_ref_siblings(item) for item in node]
    if not isinstance(node, dict):
        return node
    node = {key: _wrap_ref_siblings(value) for key, value in node.items()}
    if "$ref" in node and len(node) > 1:
        siblings = {k: v for k, v in node.items() if k not in ("$ref", "default")}
        if not siblings:
            return {"$ref": node["$ref"]}
        return {"allOf": [{"$ref": node["$ref"]}], **siblings}
    if (
        "default" in node
        and "anyOf" in node
        and any(isinstance(item, dict) and "$ref" in item for item in node["anyOf"])
    ):
        # Nullable refs (``X | None = None``): the default adds nothing for TS either.
        del node["default"]
    return node


def public_types() -> dict[str, Any]:
    """Name -> type of every model, enum and union included in the schema."""
    found: dict[str, Any] = {}
    for module in (geometry, config, events, api):
        for name, value in vars(module).items():
            if name.startswith("_") or not isinstance(value, type) or value in _EXCLUDED:
                continue
            if value.__module__ != module.__name__:
                continue  # imported from elsewhere
            if issubclass(value, BaseModel | Enum):
                found[name] = value
    found.update(_UNIONS)
    return dict(sorted(found.items()))


def build_json_schema() -> dict[str, Any]:
    """Build the combined JSON Schema document (see module docstring)."""
    types = public_types()
    mode: JsonSchemaMode = "serialization"
    inputs = [(name, mode, TypeAdapter(tp)) for name, tp in types.items()]
    key_map, combined = TypeAdapter.json_schemas(inputs, schema_generator=_TsFriendlyGenerator)
    defs: dict[str, Any] = dict(combined.get("$defs", {}))
    for (name, _mode), schema in key_map.items():
        ref = schema.get("$ref")
        if ref is not None:
            if ref != f"#/$defs/{name}":
                raise RuntimeError(f"{name} was exported as {ref}; names must be unique")
        else:
            defs[name] = {"title": name, **schema}
    defs = {name: _wrap_ref_siblings(schema) for name, schema in sorted(defs.items())}
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "RvContracts",
        "description": (
            "Restaurant Vision contracts, schema version "
            f"{SCHEMA_VERSION}. Generated by rv_contracts.schema_export; do not edit."
        ),
        "x-schema-version": SCHEMA_VERSION,
        "type": "object",
        "properties": {name: {"$ref": f"#/$defs/{name}"} for name in types},
        "required": list(types),
        "additionalProperties": False,
        "$defs": defs,
    }


def render_json_schema() -> str:
    """The schema document as deterministic, pretty-printed JSON text."""
    return json.dumps(build_json_schema(), indent=2, ensure_ascii=False) + "\n"


def export_json_schema(path: str | Path) -> Path:
    """Write the schema document to ``path`` (parent directories are created)."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(render_json_schema(), encoding="utf-8")
    return target


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m rv_contracts.schema_export",
        description="Write the rv_contracts JSON Schema document.",
    )
    parser.add_argument(
        "path", help="output file, e.g. web/packages/shared/src/contracts/schema.json"
    )
    parser.add_argument(
        "--check", action="store_true", help="do not write; exit 1 if the file is out of date"
    )
    args = parser.parse_args(argv)
    path = Path(args.path)
    if args.check:
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current != render_json_schema():
            print(f"{path} is out of date; run python -m rv_contracts.schema_export {path}",
                  file=sys.stderr)
            return 1
        print(f"{path} is up to date")
        return 0
    print(export_json_schema(path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
