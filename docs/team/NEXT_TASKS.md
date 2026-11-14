# Next tasks

The requested real Jezero terrain implementation is complete. The remaining items are verification or optional enhancements.

## 1. Manual browser verification

Start FastAPI and the Vite app using the commands in PROJECT_STATUS.md. Check the real terrain map at desktop and mobile widths, all four layers and legends, zone alignment, dark/light themes, English/Myanmar strings, reduced motion, route comparison, closure rerouting, emergency return, and report continuity. No headless browser was available during this pass.

## 2. GIS QA

Run scripts/gis/validate_outputs.py from an environment with GDAL/osgeo installed. The current Python environment has no GDAL module, so this was not rerun.

## 3. Optional CTX 5 m orthomosaic

Download and license-review the optional 5 m CTX orthomosaic before adding it. Keep it out of the repository unless a large-file-storage policy is agreed; the current real workflow uses the validated terrain, elevation, slope, and hillshade previews.

## 4. Housekeeping

- Coordinate a separate CRLF/prettier normalization change if desired.
- Decide whether to merge the feature branch into main later; do not rewrite published Lovable history.
- Add a web statistics API only if a non-frontend consumer needs it; the current frontend reads public/jezero metadata directly.
