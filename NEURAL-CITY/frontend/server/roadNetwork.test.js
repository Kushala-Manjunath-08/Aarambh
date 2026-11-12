import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createRoadNetwork } from "./roadNetwork.js";

const fixture = [
  {
    properties: { osm_id: "main", name: "Main Road", type: "primary" },
    geometry: {
      type: "LineString",
      coordinates: [[0, 0], [0.001, 0], [0.002, 0]]
    }
  },
  {
    properties: { osm_id: "north-1", name: "North Link", type: "service" },
    geometry: {
      type: "LineString",
      coordinates: [[0, 0], [0.001, 0.001]]
    }
  },
  {
    properties: { osm_id: "north-2", name: "North Detour", type: "service" },
    geometry: {
      type: "LineString",
      coordinates: [[0.001, 0.001], [0.002, 0]]
    }
  }
];

test("road graph returns a shortest route and detours around a simulated closure", () => {
  const network = createRoadNetwork(fixture);
  const origin = { label: "Origin", coordinates: [0, 0] };
  const destination = { label: "Destination", coordinates: [0.002, 0] };
  const baseline = network.routeBetween(origin, destination, "baseline");
  const closed = network.routeBetween(origin, destination, "closure");

  assert.equal(baseline.status, "available");
  assert.equal(baseline.roadNames.includes("Main Road"), true);
  assert.equal(closed.status, "available");
  assert.equal(closed.blockedSegment.roadName, "Main Road");
  assert.ok(closed.distanceMeters > baseline.distanceMeters);
  assert.ok(closed.roadNames.includes("North Link"));
});

test("rain scenario increases estimated travel time on the same road graph", () => {
  const network = createRoadNetwork(fixture);
  const route = { label: "Origin", coordinates: [0, 0] };
  const destination = { label: "Destination", coordinates: [0.002, 0] };
  const baseline = network.routeBetween(route, destination, "baseline");
  const rainy = network.routeBetween(route, destination, "rain");

  assert.ok(rainy.estimatedMinutes >= baseline.estimatedMinutes);
  assert.equal(rainy.status, "available");
});

test("Yelahanka route presets resolve against the project road GeoJSON", async () => {
  const data = JSON.parse(
    await readFile(new URL("../public/data/roads.geojson", import.meta.url), "utf8")
  );
  const network = createRoadNetwork(data.features);
  const baselineRoutes = network.calculateRoutes("baseline");
  const closureRoutes = network.calculateRoutes("closure");

  assert.equal(baselineRoutes.length, 3);
  assert.ok(network.nodeCount > 1000);
  assert.ok(baselineRoutes.every((route) =>
    route.status === "available"
    && route.coordinates.length > 1
    && route.snapDistanceMeters < 100
  ));
  assert.ok(closureRoutes.every((route) =>
    route.status === "available"
    && typeof route.blockedSegment?.roadName === "string"
  ));
});
