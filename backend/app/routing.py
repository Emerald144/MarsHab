import heapq
import math
from dataclasses import dataclass

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import Window, from_bounds

from .data import COST_PATH, DEM_PATH, SLOPE_PATH
from .models import RouteRequest

MAX_GRID_DIMENSION = 300

@dataclass
class Grid:
    costs: np.ndarray
    slopes: np.ndarray
    west: float
    north: float
    cell_x: float
    cell_y: float

    def coordinate_to_cell(self, easting: float, northing: float) -> tuple[int, int]:
        row = int((northing - self.north) / self.cell_y)
        col = int((easting - self.west) / self.cell_x)
        # A coordinate on a rounded raster-window edge may resolve to the next
        # cell numerically. Clamp it to the loaded window; coverage is checked
        # before the window is read.
        return (max(0, min(self.costs.shape[0] - 1, row)), max(0, min(self.costs.shape[1] - 1, col)))

    def cell_to_coordinate(self, row: int, col: int) -> list[float]:
        return [self.west + (col + .5) * self.cell_x, self.north + (row + .5) * self.cell_y]

def _load_grid(request: RouteRequest) -> Grid:
    # The direct corridor can be cut by a scarp or an impassable (>15°) DEM
    # cell. Keep a meaningful detour envelope instead of declaring no route
    # merely because a valid path leaves a narrow 1 km box.
    margin = max(5_000, max((c.radius_m for c in request.closures), default=0) + 400)
    west = min(request.start.easting, request.destination.easting) - margin
    east = max(request.start.easting, request.destination.easting) + margin
    south = min(request.start.northing, request.destination.northing) - margin
    north = max(request.start.northing, request.destination.northing) + margin
    with rasterio.open(COST_PATH) as cost_ds, rasterio.open(SLOPE_PATH) as slope_ds:
        bounds = cost_ds.bounds
        if west < bounds.left or east > bounds.right or south < bounds.bottom or north > bounds.top:
            raise ValueError("start or destination is outside the DEM coverage")
        raw = from_bounds(west, south, east, north, transform=cost_ds.transform).round_offsets().round_lengths()
        scale = max(1, math.ceil(max(raw.width, raw.height) / MAX_GRID_DIMENSION))
        out_h, out_w = max(2, math.ceil(raw.height / scale)), max(2, math.ceil(raw.width / scale))
        costs = cost_ds.read(1, window=raw, out_shape=(out_h, out_w), resampling=Resampling.average)
        slopes = slope_ds.read(1, window=raw, out_shape=(out_h, out_w), resampling=Resampling.average)
        transform = cost_ds.window_transform(raw)
        return Grid(costs=costs, slopes=slopes, west=transform.c, north=transform.f, cell_x=abs(transform.a) * scale, cell_y=-abs(transform.e) * scale)

def _astar(grid: Grid, start: tuple[int, int], goal: tuple[int, int], terrain_aware: bool) -> tuple[list[tuple[int, int]], float]:
    rows, cols = grid.costs.shape
    def valid(r: int, c: int) -> bool:
        if not (0 <= r < rows and 0 <= c < cols):
            return False
        cost, slope = grid.costs[r, c], grid.slopes[r, c]
        return np.isfinite(cost) and np.isfinite(slope) and 1 <= cost < 100 and 0 <= slope <= 15
    if not valid(*start) or not valid(*goal):
        raise ValueError("start or destination is not traversable at the available DEM scale")
    queue = [(0.0, 0.0, start)]
    previous: dict[tuple[int, int], tuple[int, int]] = {}
    travelled = {start: 0.0}
    while queue:
        _, current_cost, current = heapq.heappop(queue)
        if current_cost != travelled.get(current):
            continue
        if current == goal:
            path = [current]
            while current in previous:
                current = previous[current]
                path.append(current)
            return path[::-1], current_cost
        for dr, dc in ((-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)):
            nr, nc = current[0] + dr, current[1] + dc
            if not valid(nr, nc):
                continue
            distance = math.hypot(grid.cell_y * dr, grid.cell_x * dc)
            multiplier = 1.0 if not terrain_aware else 1.0 + max(0., float(grid.costs[nr, nc]) - 1.) / 10.
            candidate = current_cost + distance * multiplier
            neighbour = (nr, nc)
            if candidate < travelled.get(neighbour, float("inf")):
                travelled[neighbour] = candidate
                previous[neighbour] = current
                heuristic = math.hypot((goal[0]-nr)*grid.cell_y, (goal[1]-nc)*grid.cell_x)
                heapq.heappush(queue, (candidate + heuristic, candidate, neighbour))
    raise ValueError("no traversable route found")

def _nearest_traversable(grid: Grid, cell: tuple[int, int], max_radius_cells: int = 50) -> tuple[int, int]:
    """Snap a requested point on a resampled/blocked cell to a nearby valid cell.

    This is relevant for a destination *region*: its geometric centre can land
    on a coarse DEM cell classified as impassable even though adjacent terrain
    within that same planning area is traversable.
    """
    rows, cols = grid.costs.shape
    def valid(r: int, c: int) -> bool:
        return 0 <= r < rows and 0 <= c < cols and np.isfinite(grid.costs[r, c]) and np.isfinite(grid.slopes[r, c]) and 1 <= grid.costs[r, c] < 100 and 0 <= grid.slopes[r, c] <= 15
    if valid(*cell):
        return cell
    for radius in range(1, max_radius_cells + 1):
        candidates = []
        for r in range(cell[0] - radius, cell[0] + radius + 1):
            candidates.extend(((r, cell[1] - radius), (r, cell[1] + radius)))
        for c in range(cell[1] - radius + 1, cell[1] + radius):
            candidates.extend(((cell[0] - radius, c), (cell[0] + radius, c)))
        for candidate in candidates:
            if valid(*candidate):
                return candidate
    raise ValueError("start or destination is not traversable within the route search area")

def route(request: RouteRequest) -> dict:
    grid = _load_grid(request)
    for closure in request.closures:
        yy, xx = np.indices(grid.costs.shape)
        x = grid.west + (xx + .5) * grid.cell_x
        y = grid.north + (yy + .5) * grid.cell_y
        grid.costs[(x-closure.center.easting)**2 + (y-closure.center.northing)**2 <= closure.radius_m**2] = 100
    requested_start = grid.coordinate_to_cell(request.start.easting, request.start.northing)
    requested_destination = grid.coordinate_to_cell(request.destination.easting, request.destination.northing)
    start = _nearest_traversable(grid, requested_start)
    destination = _nearest_traversable(grid, requested_destination)
    path, cumulative_cost = _astar(grid, start, destination, request.mode == "terrain_aware")
    coordinates = [grid.cell_to_coordinate(r, c) for r, c in path]
    distance = sum(math.dist(a, b) for a, b in zip(coordinates, coordinates[1:]))
    path_slopes = [float(grid.slopes[r, c]) for r, c in path]
    with rasterio.open(DEM_PATH) as dem_ds:
        elevations = [float(v[0]) for v in dem_ds.sample(coordinates)]
    diffs = [b - a for a, b in zip(elevations, elevations[1:])]
    elevation_gain = sum(d for d in diffs if d > 0)
    elevation_loss = -sum(d for d in diffs if d < 0)
    slope_above_10_fraction = sum(1 for s in path_slopes if s > 10) / len(path_slopes)
    one_way_hours = distance / request.walking_speed_m_per_hour
    total_hours = one_way_hours * 2 + request.activity_hours + request.contingency_hours
    algorithm_name = "A* (8-connected grid, resampled 20 m DEM-derived cost raster)"
    assumptions = [
        f"Walking speed: {request.walking_speed_m_per_hour:.0f} m/h (configurable; this run used the request value, not a fixed constant).",
        "Terrain-aware mode penalizes a cell by (terrain_cost - 1) / 10 on top of geometric distance; shortest mode ignores terrain cost.",
        "Cells with terrain_cost outside [1, 100) or slope outside [0, 15] degrees are treated as impassable.",
        "Elevation gain/loss is summed from DEM samples along the path centerline, not a full-resolution profile.",
        "Not a certified astronaut-safe route: the 20 m DEM cannot resolve individual rocks or sub-pixel hazards.",
    ]
    return {"type": "Feature", "geometry": {"type": "LineString", "coordinates": coordinates}, "properties": {"mode": request.mode, "algorithm": algorithm_name, "assumptions": assumptions, "distance_m": round(distance, 1), "distance_km": round(distance / 1000, 3), "elevation_gain_m": round(elevation_gain, 1), "elevation_loss_m": round(elevation_loss, 1), "cumulative_terrain_cost": round(cumulative_cost, 1), "mean_slope_degrees": round(float(np.mean(path_slopes)), 2), "max_slope_degrees": round(float(np.max(path_slopes)), 2), "slope_exposure_fraction_above_10deg": round(slope_above_10_fraction, 3), "estimated_one_way_hours": round(one_way_hours, 2), "estimated_total_eva_hours": round(total_hours, 2), "eva_limit_hours": request.eva_limit_hours, "passes_demo_time_assumptions": None if request.eva_limit_hours is None else total_hours <= request.eva_limit_hours, "grid_resolution_m": [round(abs(grid.cell_x), 1), round(abs(grid.cell_y), 1)], "simulated_closure_count": len(request.closures), "endpoint_snapped_to_traversable_cell": start != requested_start or destination != requested_destination, "disclaimer": "Prototype terrain route using a resampled 20 m DEM. It is not a certified astronaut-safe route."}}
