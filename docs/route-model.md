# Mars route planning model

## Reference and scientific scope

Ryan Ogilvie et al., *Mars Spacesuit Mass Requirements*, ICES-2026-127,
55th International Conference on Environmental Systems (2026).
The supplied PDF is preserved in `references/Final_ICES2026_Mars_Mass_1.pdf`.
Printed pp. 8–10, sections III.B.2–6 and III.C.1 contain the assumptions
and equations 3–7; III.C.2, p. 10 gives the initial 104 kg estimate;
III.C.3, pp. 10–11 discusses walking speed and emergency walkback.
Sections II.C/II.E (pp. 5–6), IV.A (pp. 11–12) and V (p. 14)
describe architecture dependence, testing needs, and preliminary status.

This is a preliminary design comparison needing validation. It is neither a
medical eligibility test nor operational clearance. The paper's approximately
104 kg estimate applies to its reference configuration, not all suits or crew.
The paper supplies no validated mass-to-speed, terrain-to-speed, fatigue,
oxygen or battery consumption function.

## Architecture

The existing FastAPI A* terrain router remains the geometry provider.
`src/lib/route-model.ts` contains pure calculations;
`mission-evaluation.ts` adapts the existing API's Mars projected metre geometry.
Planner, comparison/recommendations, execution, overview and report use this
evaluator through the compatibility projection and shared assessment component.
The server's legacy estimates remain available to other API consumers; the
application recomputes its own planning estimates from full geometry precision.

## Inputs and formulas

Crew body mass: kg. Optional VO2max: mL/kg/min **at EVA time**, without a
second deconditioning adjustment. Suit mass: kg, basis dry/loaded/unknown.
Research comparison requires loaded mass including onboard consumables.
Equipment excludes items already included in suit mass. Sample mass (kg)
is collected at the destination stop in the current single-stop workflow;
outbound equipment and return equipment-plus-samples are assessed separately.
Intermediate collection timing and changing consumable mass are unknown.
Pressure offload: optional N; missing is unknown, never silently 213 N.

Speeds are independently editable outbound, return and emergency scenario
assumptions in km/h (the existing API stores outbound m/h, converted by
1000 at the interface boundary). EVA, science/tasks, planned rest and safety buffer use hours.
Emergency budget and contingency use minutes; enter 30, 60 or a custom value.
Defaults preserve the existing 1 km/h nominal pace. Emergency default is an
explicit scenario inspired by the paper, not a measured pace.

For each segment: `travelHours = distanceKm / speedKmh`.
`totalHours = outbound + science + rest + return + safetyBuffer`.
No mass or fitness multiplier changes speed. The explicit return path, when
supplied, has its own segments and speed; otherwise only a declared reversible
outbound route may be retraced. No arbitrary return-time multiplier is used.
`emergencyHours = worst assessed path travelHours + contingencyMinutes / 60`.
Budget statuses are within/exceeded/unknown. Invalid/nonfinite values, negative
distances/durations, nonpositive speeds or missing paths yield unknown.
Full precision is retained until display rounding.

Research reproduction uses Earth standard gravity **9.80665 m/s²** (project
conversion choice), paper Mars gravity **3.73 m/s²**, and:

```
mobilityFactor = 1 - 14 / evaVo2Max                         (eq. 3)
systemMassKg = crewMassKg + suitMassKg + carriedMassKg     (eq. 4)
perceivedForceN = systemMassKg * 3.73 - pressureOffloadN   (eq. 5)
crewCapabilityN = (crewMassKg * 9.80665 + 227) * mobilityFactor (eq. 6)
estimatedMaxSuitMassKg = (crewCapabilityN + pressureOffloadN) / 3.73
                         - crewMassKg - carriedMassKg     (eq. 7)
```

The 227 N NIOSH-derived lifting reference is not a general safe carrying limit.
The 14 mL/kg/min term and 213 N pressure offload are paper model assumptions;
offload depends on architecture and task. The explicitly selected reference
preset uses rounded 49 kg body mass, VO2max 36, 23 kg equipment/sample carry,
213 N offload and 104 kg suit comparison mass. The stated equations and these SI
inputs produce **101.023299821269 kg**, about 3 kg below the paper's reported
104 kg. This discrepancy is retained, not corrected by tuning gravity, carry
mass or offload. It cannot be confidently attributed to rounding alone from
the supplied information. The regression checks both the raw formula result
and proximity to the reported estimate with an explicit 3.1 kg tolerance.
The preset's loaded basis is a project comparison convention, not a verified
consumables configuration from the paper. VO2max <=14 is outside the useful
domain of this comparison and returns not assessed. Outputs retain raw forces,
mobility factor and allowance; negative calculated allowances are not clamped.
The comparison does not rank routes or determine survival probability.

## Geometry, provenance and coverage

Distances are **one-way**, derived by summing Euclidean segment lengths in the
API's documented Mars projected metre coordinate system. The provenance label
`measured` means derived from measured/georeferenced terrain, not a surveyed
astronaut traverse. Projection error, endpoint snapping and grid resolution
remain limitations. The round trip explicitly adds return travel; SVG pixels
are never used for physical distance. Scenario and unknown provenance are
supported by the pure model. CTX imagery alone is not an elevation model;
the current backend uses the separate DEM/slope/cost rasters.

The static backend's eight-connected graph has reversible traversal edges.
Every outbound segment endpoint can retrace cumulative distance to base under
that explicit scenario; positive lengths make the destination the worst value.
Coverage is full route under this assumption, not a guarantee that the path
will remain traversable. Loops/blocked routes cannot use this shortcut. A
supplied destination return path alone gives destination-only coverage; absent
return evidence gives none/unknown. Pending simulated closures invalidate the
old retrace comparison. Accepting a revised plan restarts the base-to-destination
preview; this is not an optimized reroute from the moving crew position.
The rover landing site is a scenario base, not an assumed rover refuge/rescue.

## Ranking, resources and limitations

Routes rank by known EVA/emergency budget violations, then evidence completeness,
then total scenario time. A best-ranked route can still fail; assessment remains
visible. The report uses the actually selected route and accepted revised plan.
The existing abstract percentage resource budget is recomputed for the revised
duration but has no validated relation to oxygen, battery or physiology.
Load results are independent research comparisons, never route safety filters.
Simulated environmental closures and execution are labeled simulations.

Stronger conclusions require validated crew/suit performance, suit mass basis,
suit-specific offload, collection stages, terrain-dependent speeds, path
reversibility, life-support capacities and consumption, thermal/radiation
constraints, fatigue and fall recovery data. A time-budget pass proves none of
these constraints. The 30/60 minute walkbacks use the paper's assumed 2.2 mph:
1 mph = 1.609344 km/h exactly, so speed = 3.5405568 km/h and half/full hour
distances = 1.7702784/3.5405568 km. These are consequences of assumptions,
not universal Mars limits or nominal exploration speeds.

## Verification

Vitest covers conversion, separate travel legs, contingency, EVA/emergency
disagreement, missing/invalid data, samples, research reference discrepancy,
mass-independent speed, ranking, and comparison/report agreement after input
changes and simulated closures. Existing UI fixtures now distinguish projected
geometry-derived time from outdated server estimates. TypeScript and production
build checks are run alongside the tests. Repository-wide lint currently has
extensive formatting/newline violations outside this change; new model files
have no lint errors. Backend tests require pytest in the Python environment.
No browser automation tool is available in this session.
