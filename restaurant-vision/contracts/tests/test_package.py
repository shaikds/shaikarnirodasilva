import rv_contracts


def test_all_names_importable_and_unique() -> None:
    names = rv_contracts.__all__
    assert len(names) == len(set(names))
    for name in names:
        assert getattr(rv_contracts, name) is not None, name


def test_schema_version() -> None:
    assert rv_contracts.SCHEMA_VERSION == "1.0"
    assert rv_contracts.SCHEMA_MAJOR == 1


def test_unknown_attribute_raises() -> None:
    try:
        rv_contracts.does_not_exist  # noqa: B018
    except AttributeError as exc:
        assert "does_not_exist" in str(exc)
    else:
        raise AssertionError("expected AttributeError")
