import numpy as np
import pytest
from affine import Affine

from app import routing


def simple_grid(costs=None, slopes=None):
    return routing.Grid(
        costs=np.ones((5, 5), dtype=float) if costs is None else np.array(costs, dtype=float),
        slopes=np.zeros((5, 5), dtype=float) if slopes is None else np.array(slopes, dtype=float),
        west=0,
        north=5,
        cell_x=1,
        cell_y=-1,
    )


def test_astar_returns_a_deterministic_valid_route():
    grid = simple_grid()
    first = routing._astar(grid, (0, 0), (4, 4), terrain_aware=True)
    second = routing._astar(grid, (0, 0), (4, 4), terrain_aware=True)
    assert first == second
    assert first[0][0] == (0, 0)
    assert first[0][-1] == (4, 4)
    assert all(0 <= row < 5 and 0 <= col < 5 for row, col in first[0])


def test_astar_routes_around_a_blocked_band():
    costs = np.ones((5, 5), dtype=float)
    costs[2, 1:4] = 100
    path, _ = routing._astar(simple_grid(costs=costs), (2, 0), (2, 4), terrain_aware=True)
    assert not any(row == 2 and 1 <= col <= 3 for row, col in path)


def test_astar_rejects_nodata_at_an_endpoint():
    costs = np.ones((5, 5), dtype=float)
    costs[0, 0] = np.nan
    with pytest.raises(ValueError, match="not traversable"):
        routing._astar(simple_grid(costs=costs), (0, 0), (4, 4), terrain_aware=True)


def test_raster_compatibility_rejects_mismatched_crs():
    class Raster:
        transform = Affine.identity()

        def __init__(self, crs):
            self.crs = crs

    with pytest.raises(ValueError, match="compatible CRS"):
        routing._assert_compatible_rasters(Raster("mars"), Raster("mars"), Raster("earth"))


def test_raster_compatibility_rejects_mismatched_geotransform():
    class Raster:
        crs = "mars"

        def __init__(self, transform):
            self.transform = transform

    with pytest.raises(ValueError, match="geotransform"):
        routing._assert_compatible_rasters(
            Raster(Affine.identity()),
            Raster(Affine.translation(1, 0)),
            Raster(Affine.identity()),
        )
