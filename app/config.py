from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
DATA_DIR = PROJECT_DIR / "nasa-data"
RASTER_DIR = DATA_DIR / "Jezero_CTX_DEM"
ZONES_PATH = DATA_DIR / "Jezero_HiRISE_DEM" / "jezero_final_zones.geojson"
STATS_PATH = DATA_DIR / "Jezero_HiRISE_DEM" / "jezero_terrain_statistics.json"
METADATA_PATH = DATA_DIR / "Jezero_HiRISE_DEM" / "jezero_dataset_metadata.json"
ROVER_PATH = DATA_DIR / "Martian_Map_Rover_Files" / "Martian_Map_Rover_Files" / "best_interp.csv"
WEATHER_DIR = DATA_DIR / "Jezero_Weather_" / "MEDA Weather Data"
