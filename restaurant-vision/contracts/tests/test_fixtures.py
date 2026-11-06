import itertools

from rv_contracts import (
    CameraSource,
    Crossing,
    EventType,
    SiteConfig,
    ZoneKind,
    line_crossing,
    point_in_polygon,
    polygon_area,
)
from rv_contracts.fixtures import (
    CAM_DINING,
    CAM_ENTRANCE,
    ENTRANCE_LINE_ZONE_ID,
    QUEUE_ZONE_ID,
    STAFF_ZONE_ID,
    sample_events,
    sample_site_config,
)


def test_sample_config_shape() -> None:
    config = sample_site_config()
    assert isinstance(config, SiteConfig)
    assert [c.camera_id for c in config.cameras] == [CAM_DINING, CAM_ENTRANCE]
    assert len(config.tables) == 8
    assert sorted({t.seats for t in config.tables}) == [2, 4, 6]
    assert config.coverage() == []
    kinds = {z.kind for z in config.zones}
    assert {ZoneKind.TABLE, ZoneKind.QUEUE, ZoneKind.ENTRANCE_LINE, ZoneKind.STAFF_AREA,
            ZoneKind.PRIVACY} <= kinds
    by_id = {z.zone_id: z for z in config.zones}
    assert by_id[QUEUE_ZONE_ID].camera_id == CAM_ENTRANCE
    assert by_id[ENTRANCE_LINE_ZONE_ID].camera_id == CAM_ENTRANCE
    assert by_id[STAFF_ZONE_ID].camera_id == CAM_DINING
    assert len(config.privacy_masks_for(CAM_DINING)) == 1


def test_sample_config_is_revalidatable_and_parametrized() -> None:
    config = sample_site_config("site-x", source=CameraSource.RTSP)
    assert config.site_id == "site-x"
    assert {c.source for c in config.cameras} == {CameraSource.RTSP}
    assert SiteConfig.model_validate(config.model_dump()) == config


def test_sample_table_zones_do_not_overlap() -> None:
    config = sample_site_config()
    polygons = [z.polygon for z in config.zones_for(CAM_DINING, ZoneKind.TABLE)]
    for a, b in itertools.combinations(polygons, 2):
        assert a is not None and b is not None
        assert not any(point_in_polygon(p, b) for p in a)
        assert not any(point_in_polygon(p, a) for p in b)
        assert polygon_area(a) > 0.01


def test_sample_entrance_line_inward_is_towards_dining_room() -> None:
    config = sample_site_config()
    line_zone = config.zones_for(CAM_ENTRANCE, ZoneKind.ENTRANCE_LINE)[0]
    queue = config.zones_for(CAM_ENTRANCE, ZoneKind.QUEUE)[0]
    assert line_zone.line is not None and queue.polygon is not None
    in_queue = (0.4, 0.7)
    assert point_in_polygon(in_queue, queue.polygon)
    assert line_crossing(line_zone.line, in_queue, (0.8, 0.7)) is Crossing.IN
    assert line_crossing(line_zone.line, (0.8, 0.7), in_queue) is Crossing.OUT


def test_sample_events_cover_every_type() -> None:
    events = sample_events()
    assert {e.type for e in events} == set(EventType)
    assert len({e.event_id for e in events}) == len(events)
    assert {e.site_id for e in events} == {"site-demo"}
