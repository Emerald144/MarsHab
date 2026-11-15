# TerraNexis — Project Overview

**Project:** TerraNexis / Martian Map  
**Purpose:** An interactive Mars exploration and survival-planning experience.  
**Current scope:** A web prototype focused on a Jezero Crater mission scenario.  
**Languages:** English and Unicode Myanmar.

## 1. Project concept

TerraNexis helps users explore how terrain, resource access, scientific value, and available mission time influence a Mars exploration plan. It combines an immersive 3D Mars experience with a mission-control dashboard, an interactive regional map, feasibility calculations, route comparison, and simulated mission events.

The project demonstrates a planning workflow:

**Explore → Understand → Assess → Plan → Compare routes → Simulate → Review**

It is intended for educational demonstrations, team presentations, and exploration of a mission-planning interface. Its scores and scenarios are prototype estimates, not operational guidance or official NASA safety classifications.

## 2. Project scope

### Included in the current application

- A cinematic landing page with an interactive 3D Mars globe.
- A mission-control Overview dashboard.
- A Jezero-themed regional map with selectable zones and optional information layers.
- Survival, Science, and Emergency mission modes.
- Mission setup and time-based feasibility checks.
- Three preset route alternatives and comparison metrics.
- A simulated mission with environmental changes, rerouting, and emergency-return controls.
- An on-screen mission summary and recommendation.
- English/Myanmar language switching and light/dark themes.
- Responsive layouts, scroll animations, and motion-accessibility controls.

### Outside the current scope

- Live spacecraft or astronaut telemetry.
- Verified geographic navigation, GIS analysis, or a georeferenced descent to Jezero.
- Automatic route optimization against real terrain datasets.
- Validated astronaut life-support, oxygen, radiation, weather, or energy-consumption models.
- A connected AI model generating route explanations.
- User accounts, collaborative planning, or a mission database.
- A completed downloadable report export.

## 3. Included features

### 3.1 Landing page and orbital introduction

The landing page introduces TerraNexis through a textured Three.js Mars globe, atmospheric lighting, a starfield, and surrounding space effects. Users can drag to rotate the globe and scroll to zoom.

Entering mission control starts an illustrative orbital-approach sequence that dissolves into the existing Jezero regional imagery. A skip link provides direct access to the mission page. The sequence communicates a cinematic journey; it does not claim a geographically verified landing trajectory.

### 3.2 Overview dashboard

The Overview combines mission briefing, setup status, and the planning action in one wide mission-control banner. It includes:

- The mission name and selected destination.
- Feasibility-check and route-generation status.
- EVA time allocation; EVA means extravehicular activity.
- A calculated zone suitability score.
- A mission-time indicator and remaining or exceeded time.
- Environmental factor ratings and zone explanations.
- A five-step workflow: Understand, Assess, Plan, Navigate, and Adapt.
- A Jezero regional-map preview.

A decorative 3D Mars globe rotates approximately once every 90 seconds of active animation. It responds to the existing theme and Pause effects control, respects reduced-motion preferences, suspends rendering when off-screen or in a hidden tab, and provides a static-image fallback when rendering fails.

The dashboard also contains explicitly illustrative indicators: its **92% feasibility figure** is fixed, and **three routes analyzed** describes the preset comparison set. These are separate from the actual time-based feasibility calculation.

### 3.3 Interactive Survival Map

The regional map contains eight selectable demonstration zones, **A-12 through A-19**. Users can inspect a zone's suitability, factor ratings, and explanation before selecting it as their destination.

Available layers are:

| Layer                | Information displayed                                         |
| -------------------- | ------------------------------------------------------------- |
| Survival Suitability | Zone scores, boundaries, and suitability colors               |
| Terrain              | An enhanced terrain-image treatment and illustrative contours |
| Hazards              | Modeled rim slopes, a boulder field, and a dune trap          |
| Resources            | Simulated ice signatures and hydrated-mineral markers         |
| Science Targets      | Named science-interest locations                              |
| Rover Observations   | Example observation markers labeled by Sol                    |

The map uses an SVG coordinate space over a local image. Its polygons, paths, and markers are demonstration overlays, not verified geographic measurements.

### 3.4 Mission modes

Changing mode changes the weighting used to calculate zone suitability:

| Factor             | Survival | Science | Emergency |
| ------------------ | -------: | ------: | --------: |
| Terrain Safety     |      35% |     25% |       30% |
| Resource Access    |      30% |     20% |       10% |
| Accessibility      |      25% |     20% |       40% |
| Environmental Risk |       0% |      0% |       20% |
| Science Value      |      10% |     35% |        0% |

The current model multiplies each included factor rating by its weight, sums the results, and rounds to the nearest integer:

```text
Suitability score = round(sum(factor rating × mode weight))
```

Suitability categories are **High: 80–100**, **Moderate: 60–79**, and **Low: 0–59**.

These weights and ratings are locally authored prototype values. The field named Environmental Risk is used directly as a model rating; it is not a measured hazard probability.

### 3.5 Mission setup and feasibility

Users can configure a mission name, mode, destination, available EVA time, science-activity time, safety buffer, and simulated resource level. The current interface offers Perseverance Base as the starting base.

The feasibility check uses the selected zone's preset outbound travel time:

```text
Return time = outbound time × 0.94, rounded to one decimal place
Total time = outbound + science activity + return + safety buffer
Remaining time = available EVA time − total time
Feasible = total time ≤ available EVA time
```

For the default A-17 setup, the application calculates **5.2 h total** against **6 h available**, leaving **0.8 h**.

The results include a time breakdown, timeline, feasibility status, and suggestions when the mission exceeds its available time. The simulated resource-level input is stored in mission setup but is not used by this time-feasibility formula.

### 3.6 Route comparison

The route page displays three alternatives:

| Route | Strategy          | Distance | Preset time | Preset feasibility | Initial survival score |
| ----- | ----------------- | -------: | ----------: | ------------------ | ---------------------: |
| A     | Shortest Path     |   7.2 km |       4.9 h | Yes                |                     78 |
| B     | Balanced Survival |   8.1 km |       5.2 h | Yes                |                     91 |
| C     | Science Priority  |   9.0 km |       6.7 h | No                 |           Not assigned |

Users can highlight routes, compare terrain risk, resource access, science value, and time, and read the recommendation for Route B.

The Generate Routes action exposes the predefined route set after a short simulated processing delay. Route curves adapt to the chosen destination, but the comparison metrics remain preset. The explanatory text is authored UI content, including the section labeled AI Explains; no connected language-model service generates it.

### 3.7 Simulated execution and rerouting

Starting a simulated mission displays an animated position marker, elapsed and remaining time indicators, and the active route's suitability.

Users can trigger a demonstration environmental change. In this scenario, Route B's score changes from **91 to 69**, and the interface offers Route A with an updated score of **80**. Accepting the alternative updates the active route and records the rerouting event.

Emergency mode provides a return-to-base panel and a control to initiate a simulated return along Route A. These behaviors illustrate contingency planning rather than detecting real environmental changes or calculating an optimized emergency route.

### 3.8 Mission report

The report summarizes the mission name, region, mode, destination, route recommendation, feasibility, mission time, and simulated events. It includes survival analysis and a final recommendation.

The Export Mission Report button currently changes to **Report Prepared (demo)**. It does not yet create or download a PDF, CSV, or other report file. Some report values and route narratives remain preset scenario content.

### 3.9 Language, themes, and accessibility

- English is the default language; users can switch to Unicode Myanmar without reloading.
- Language preference is saved in browser local storage and restored across navigation and refreshes when storage is available.
- Translations cover landing and mission UI, dynamic descriptions, map labels, statuses, tooltips, and accessibility text.
- IDs, coordinates, numbers, units, official science-target names, and user-entered mission names remain unchanged.
- Language switching updates existing components without resetting mission state, map selections, or globe instances.
- The interface supports light and dark themes, a midnight-blue/orange visual identity, and liquid-glass cards.
- Selected sections use GSAP entrance animations, subtle floating effects, and bounded Overview parallax.
- Pause effects and reduced-motion support provide stable alternatives to decorative movement.

## 4. Data sources and provenance

The current application reads **bundled local imagery and locally defined demonstration data**. No live NASA, JPL, USGS, weather, or rover-data ingestion was found in the inspected mission implementation.

| Data or asset                                          | Repository source                                           | Current use and provenance                                                                                                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zone geometry, ratings, travel times, and explanations | `src/lib/mission-data.ts` — `ZONES`                         | Eight locally defined demonstration zones; not an imported scientific dataset                                                                              |
| Mission-mode weights and factor labels                 | `src/lib/mission-data.ts` — `MODE_WEIGHTS`, `FACTOR_LABELS` | Application-defined scoring model                                                                                                                          |
| Routes, distances, times, scores, and scenario changes | `src/lib/mission-data.ts` — `ROUTES`                        | Preset demonstration alternatives and event outcomes                                                                                                       |
| Hazard and resource markers                            | `src/lib/mission-data.ts` — `HAZARDS`, `RESOURCES`          | Locally positioned illustrative markers; not verified discoveries                                                                                          |
| Science-target and rover markers                       | `src/lib/mission-data.ts` — `SCIENCE_TARGETS`, `ROVER_OBS`  | Named contextual locations and example Sol markers; positions are SVG coordinates                                                                          |
| Jezero regional image                                  | `src/assets/jezero-map.jpg`                                 | Background map, Overview preview, and transition imagery; original publisher, dataset identifier, and license are not recorded in the inspected repository |
| Mars color texture                                     | `src/assets/mars/mars-color.jpg`                            | Surface texture for the landing and Overview globes; original publisher and license are not recorded                                                       |
| Mars bump texture                                      | `src/assets/mars/mars-bump.jpg`                             | Visual surface relief for the globes; not used as a geospatial elevation model for planning; original publisher and license are not recorded               |
| Static Mars image                                      | `src/assets/mars-globe.jpg`                                 | Overview globe fallback; original publisher and license are not recorded                                                                                   |
| Mission configuration                                  | User input and `src/lib/mission-store.tsx` defaults         | Current-session application state                                                                                                                          |
| English/Myanmar UI text                                | `src/i18n/translations.ts`                                  | Locally maintained translations, not scientific data                                                                                                       |

Science-target labels include Delta Front, Séítah Ridge, Belva Crater, Kodiak Butte, and Margin Unit. Rover markers use Sol 412, Sol 518, and Sol 603. These labels provide context; their presence does not establish that the application has imported the corresponding scientific observations.

The interface contains NASA-related descriptions and a badge category labeled Derived from NASA datasets. **Those descriptions alone do not verify image provenance or scientific-data integration.** Before presenting any asset as NASA-sourced, the team should record its original URL, publisher, product identifier where applicable, and usage/attribution terms.

## 5. Main application functions

| Function or component                              | Responsibility                                                               | Main source file                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `score()`                                          | Calculate a mode-weighted zone suitability score                             | `src/lib/mission-data.ts`                                                           |
| `tier()` / `tierColor()`                           | Assign suitability categories and display colors                             | `src/lib/mission-data.ts`                                                           |
| `routePath()`                                      | Build illustrative SVG route curves from the base to a destination           | `src/lib/mission-data.ts`                                                           |
| `useFeasibility()`                                 | Calculate outbound, return, total, remaining time, and feasibility           | `src/components/mars/Views.tsx`                                                     |
| `MissionProvider` / `useMission()`                 | Share mission setup, navigation, destination, route, and scenario state      | `src/lib/mission-store.tsx`                                                         |
| `SurvivalMapView` / `MarsMap`                      | Manage map layers, zone inspection, route visualization, and mission markers | `src/features/survival-map/SurvivalMapView.tsx`, `src/components/mars/MarsMap.tsx`  |
| `OverviewDashboard`                                | Present mission briefing, telemetry, environmental factors, and workflow     | `src/components/mars/overview/OverviewDashboard.tsx`                                |
| `OverviewMarsGlobe`                                | Render and manage the decorative rotating globe and fallback                 | `src/components/mars/overview/OverviewMarsGlobe.tsx`                                |
| `Planner`, `RouteAnalysis`, `Execution`, `Report`  | Implement the mission-planning and simulation stages                         | `src/components/mars/Views.tsx`                                                     |
| `LanguageProvider`, `useLanguage()`, `translate()` | Switch UI language, persist the preference, and format translated text       | `src/i18n/`                                                                         |
| `AnimatedContent` / `useOverviewMotion()`          | Provide reusable entrance animations and bounded Overview motion             | `src/components/animations/AnimatedContent.tsx`, `src/hooks/use-overview-motion.ts` |

Mission state currently lives in React memory and resets when the mission application is reloaded or remounted. Language and theme preferences use browser storage; they do not constitute saved mission records.

## 6. Technology stack

| Area                              | Technology                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| Application                       | React 19 and TypeScript                                                                  |
| Routing and application framework | TanStack Router and TanStack Start                                                       |
| Build and server tooling          | Vite and Nitro                                                                           |
| Styling and UI                    | Tailwind CSS, reusable glass styles, Radix/shadcn-style components, Lucide icons         |
| 3D graphics                       | Three.js, textured spheres, lighting, atmosphere effects, and orbit controls             |
| Animation                         | GSAP / ScrollTrigger, React Bits-derived AnimatedContent, CSS, and requestAnimationFrame |
| Localization                      | Project-owned typed translation dictionary and React context                             |
| Development tooling               | Bun/npm scripts, TypeScript, ESLint, Prettier, Vitest, and Testing Library               |
| Project editing integration       | Lovable-connected repository                                                             |

## 7. Suggested group demonstration

1. Open the landing page and demonstrate the 3D Mars globe.
2. Enter mission control and explain the Overview indicators, distinguishing calculated values from illustrative figures.
3. Open the Survival Map, enable layers, and inspect a zone.
4. Change mission mode to show its effect on suitability scoring.
5. Select a destination and adjust mission time or science-activity time.
6. Run the feasibility check and inspect the timeline.
7. Generate the preset route alternatives and compare A, B, and C.
8. Start the simulated mission, trigger an environmental change, and accept a reroute.
9. Review the mission report and demonstrate English/Myanmar switching.

## 8. Possible next steps

These are proposed extensions, not existing features:

- Establish an asset-credit register with verified imagery provenance and licenses.
- Import documented, georeferenced terrain or scientific datasets.
- Replace preset route metrics with calculations tied to actual terrain and mission inputs.
- Add resource-consumption and environmental models with documented assumptions.
- Make recommendations and report narratives fully consistent with all chosen inputs.
- Implement downloadable reports and optional saved missions.

**Team description:** TerraNexis is a bilingual, interactive Mars mission-planning prototype that combines 3D visualization, zone suitability scoring, time-feasibility analysis, preset route comparison, and simulated rerouting in a mission-control interface.
