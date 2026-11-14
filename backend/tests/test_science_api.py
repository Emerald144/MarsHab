from app.science_api import router


def test_expected_read_only_routes_exist():
    paths = {route.path for route in router.routes}
    assert paths == {"/api/science/sources", "/api/science/targets", "/api/science/targets/{target_id}"}
    assert all(route.methods == {"GET"} for route in router.routes)
