
import json
import time
from pathlib import Path

import requests
from shapely.geometry import LineString, Polygon, mapping

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
PUBLIC_DIR = ROOT / "frontend" / "public" / "data"

RAW_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

QUERY_FILE = RAW_DIR / "yelahanka_query.overpassql"

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

if not QUERY_FILE.exists():
    raise FileNotFoundError(f"Missing query file: {QUERY_FILE}")

query = QUERY_FILE.read_text(encoding="utf-8")

headers = {
    "User-Agent": "NeuralCity/1.0 (educational urban digital twin project)"
}

print("Downloading Yelahanka OpenStreetMap data...")

response = requests.post(
    OVERPASS_URL,
    data={"data": query},
    headers=headers,
    timeout=180
)

response.raise_for_status()

osm_data = response.json()

raw_file = RAW_DIR / "yelahanka_osm.json"

raw_file.write_text(
    json.dumps(osm_data, indent=2),
    encoding="utf-8"
)

roads = []
buildings = []

for element in osm_data.get("elements", []):

    if element.get("type") != "way":
        continue

    tags = element.get("tags", {})
    geometry = element.get("geometry", [])

    if len(geometry) < 2:
        continue

    coordinates = [
        [point["lon"], point["lat"]]
        for point in geometry
    ]

    properties = {
        "osm_id": element["id"],
        "name": tags.get("name", "Unnamed"),
        "type": tags.get("highway", tags.get("building", "unknown"))
    }

    if "highway" in tags:
        line = LineString(coordinates)

        if line.is_valid and not line.is_empty:
            roads.append({
                "type": "Feature",
                "geometry": mapping(line),
                "properties": properties
            })

    if "building" in tags and len(coordinates) >= 4:
        if coordinates[0] != coordinates[-1]:
            coordinates.append(coordinates[0])

        polygon = Polygon(coordinates)

        if polygon.is_valid and not polygon.is_empty:
            buildings.append({
                "type": "Feature",
                "geometry": mapping(polygon),
                "properties": properties
            })


def save_geojson(filename, features):
    result = {
        "type": "FeatureCollection",
        "features": features
    }

    output = PUBLIC_DIR / filename

    output.write_text(
        json.dumps(result),
        encoding="utf-8"
    )

    print(f"Saved: {output}")


save_geojson("roads.geojson", roads)
save_geojson("buildings.geojson", buildings)

print("\nYelahanka GIS download completed!")
print("Road features:", len(roads))
print("Building features:", len(buildings))
print("Raw OSM file:", raw_file)
print("OSM data attribution: © OpenStreetMap contributors")
