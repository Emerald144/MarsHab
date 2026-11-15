# Jezero Crater Data Source Reference

- **Source Name:** NASA Mars Trek / CTX Mosaic
- **NASA URL:** [NASA Mars Trek - Jezero Crater View](https://trek.nasa.gov/mars/#v=0.1&x=77.20185524565863&y=18.541298631702954&z=10&p=urn%3Aogc%3Adef%3Acrs%3AEPSG%3A%3A104905&d=&locale=&b=mars&e=76.89973122785682%2C18.29032970327895%2C77.50397926346045%2C18.79226756012696&sfz=&w=)
- **Product ID / Extent:**
  - Center Coordinates: Longitude 77.20°E, Latitude 18.54°N
  - Projection: EPSG:104905 (Mars 2000 Planetocentric)
- **Published Credit:** NASA / JPL / USGS / Arizona State University (CTX Mosaic data portal via NASA Mars Trek)
- **Download Date:** November 14, 2026

## Browser image derived from the supplied TIFF

- **Original file:** `data/jezero/jezero-ctx-mosaic.tif` (kept unchanged).
- **Original SHA-256:** `842b457afee7c2672022b66e3f60be836c6d52e99474015bfd9ced60099b8615`.
- **Browser image:** `src/assets/jezero-ctx-map.jpg`.
- **Dimensions:** 5322 × 5040 pixels for both files, preserving the original aspect ratio exactly.
- **Conversion:** Existing Windows System.Drawing/GDI+ JPEG encoder, quality 90. No resizing, cropping, rotation, reprojection, or additional enhancement was applied during conversion. JPEG compression is lossy.
- **JPEG size:** 4,680,685 bytes.
- **JPEG SHA-256:** `26c9365b2a721447187d6517a35280790099aac010baf9f0fd0ba5dbc78ef8aa`.
- **Runtime use:** Only `MarsMap.tsx` imports this JPEG. The Overview preview and cinematic transition retain `src/assets/jezero-map.jpg`.

The source name, viewer URL, center coordinates, projection description, credit, and download date above are the supplied reference information. No separate product identifier or license text was supplied; the viewer URL is not treated as a product-specific metadata record.

The JPEG is a display derivative, not a replacement for the original TIFF's geospatial metadata. The SVG retains its `1000 × 680` drawing space and centered `slice` rendering, which may crop the displayed image. No geographic registration was performed. Zones, routes, terrain ellipses, hazard/resource/science/rover markers, and planning values remain simulated and are not claimed to align geographically with this imagery. Existing runtime display filters and vignette remain in place.

The visible label reads **CTX Jezero imagery · Simulated planning overlays**, with a Myanmar translation provided by the existing translation system.
