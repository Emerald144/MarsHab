from app import data
from app.models import Point, RouteRequest
from app.routing import route

def test_dataset_metadata_has_mars_bounds():
    metadata = data.raster_metadata()
    assert metadata["resolution_m"] == [20.0, 20.0]
    assert metadata["bounds_m"]["west"] < metadata["bounds_m"]["east"]

def test_terrain_sample_at_rover_landing_location():
    sample = data.point_sample(4354494.086, 1093299.695)
    assert sample["data_covered"]
    assert sample["slope_degrees"] is not None

def test_route_rejects_outside_coverage():
    request = RouteRequest(start=Point(easting=1, northing=1), destination=Point(easting=2, northing=2))
    try:
        route(request)
    except ValueError as error:
        assert "outside" in str(error)
    else:
        raise AssertionError("expected out-of-coverage request to fail")

def test_route_returns_mars_projected_geojson():
    result = route(RouteRequest(
        start=Point(easting=4354494.086, northing=1093299.695),
        destination=Point(easting=4348665.736, northing=1094626.901),
        mode="terrain_aware",
    ))
    assert result["geometry"]["type"] == "LineString"
    assert result["properties"]["distance_m"] > 0
