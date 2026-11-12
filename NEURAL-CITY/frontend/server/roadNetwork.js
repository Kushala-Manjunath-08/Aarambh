import { ROUTE_PRESETS } from "./route-config.js";

const EARTH_RADIUS_METERS = 6371008.8;
const ROAD_SPEED_KPH = {
  primary: 50,
  secondary: 40,
  tertiary: 30,
  residential: 20,
  unclassified: 20,
  living_street: 10,
  service: 15,
  platform: 5
};

function nodeKey(coordinates) {
  return `${Math.round(coordinates[0] * 1e6)},${Math.round(coordinates[1] * 1e6)}`;
}

function haversineMeters(first, second) {
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(second[1] - first[1]);
  const longitudeDelta = toRadians(second[0] - first[0]);
  const firstLatitude = toRadians(first[1]);
  const secondLatitude = toRadians(second[1]);
  const a =
    Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scenarioMultiplier(scenarioId, roadType) {
  if (scenarioId === "rain") {
    return ["residential", "service", "living_street"].includes(roadType) ? 1.6 : 1.25;
  }
  if (scenarioId === "signals") {
    return ["primary", "secondary", "tertiary"].includes(roadType) ? 0.88 : 1;
  }
  return 1;
}

class MinHeap {
  #items = [];

  get size() {
    return this.#items.length;
  }

  push(item) {
    this.#items.push(item);
    let index = this.#items.length - 1;

    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.#items[parentIndex].cost <= item.cost) break;
      this.#items[index] = this.#items[parentIndex];
      index = parentIndex;
    }

    this.#items[index] = item;
  }

  pop() {
    if (this.#items.length === 0) return undefined;

    const first = this.#items[0];
    const last = this.#items.pop();
    if (this.#items.length > 0) {
      let index = 0;

      while (true) {
        const leftIndex = index * 2 + 1;
        const rightIndex = leftIndex + 1;
        if (leftIndex >= this.#items.length) break;

        const childIndex =
          rightIndex < this.#items.length && this.#items[rightIndex].cost < this.#items[leftIndex].cost
            ? rightIndex
            : leftIndex;
        if (this.#items[childIndex].cost >= last.cost) break;
        this.#items[index] = this.#items[childIndex];
        index = childIndex;
      }

      this.#items[index] = last;
    }

    return first;
  }
}

function edgeTravelSeconds(edge, scenarioId) {
  const baseSpeed = ROAD_SPEED_KPH[edge.roadType] ?? 20;
  const multiplier = scenarioMultiplier(scenarioId, edge.roadType);
  return edge.distanceMeters / (baseSpeed / 3.6) * multiplier;
}

export function createRoadNetwork(features) {
  if (!Array.isArray(features)) {
    throw new TypeError("Road network features must be an array.");
  }

  const nodes = new Map();
  const adjacency = new Map();
  const edges = [];

  function addNode(coordinates) {
    const key = nodeKey(coordinates);

    if (!nodes.has(key)) {
      const snappedCoordinates = [
        Math.round(coordinates[0] * 1e6) / 1e6,
        Math.round(coordinates[1] * 1e6) / 1e6
      ];
      nodes.set(key, { id: key, coordinates: snappedCoordinates });
      adjacency.set(key, []);
    }

    return nodes.get(key);
  }

  for (const feature of features) {
    const geometry = feature?.geometry;
    if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates)) continue;

    const properties = feature.properties ?? {};
    const roadType = typeof properties.type === "string" ? properties.type : "unclassified";
    const roadName =
      typeof properties.name === "string" && properties.name.trim()
        ? properties.name.trim()
        : `Unnamed ${roadType} road`;
    const osmId = properties.osm_id == null ? null : String(properties.osm_id);

    for (let index = 0; index < geometry.coordinates.length - 1; index++) {
      const firstCoordinates = geometry.coordinates[index];
      const secondCoordinates = geometry.coordinates[index + 1];
      if (
        !Array.isArray(firstCoordinates)
        || !Array.isArray(secondCoordinates)
        || !Number.isFinite(firstCoordinates[0])
        || !Number.isFinite(firstCoordinates[1])
        || !Number.isFinite(secondCoordinates[0])
        || !Number.isFinite(secondCoordinates[1])
      ) {
        continue;
      }

      const firstNode = addNode(firstCoordinates);
      const secondNode = addNode(secondCoordinates);
      const distanceMeters = haversineMeters(firstNode.coordinates, secondNode.coordinates);
      if (distanceMeters <= 0.1) continue;

      const edge = {
        id: edges.length,
        from: firstNode.id,
        to: secondNode.id,
        distanceMeters,
        roadType,
        roadName,
        osmId
      };

      edges.push(edge);
      adjacency.get(firstNode.id).push(edge);
      adjacency.get(secondNode.id).push(edge);
    }
  }

  if (nodes.size === 0 || edges.length === 0) {
    throw new Error("Road GeoJSON did not contain routable LineString features.");
  }

  function nearestNode(coordinates) {
    let nearest;
    let distanceMeters = Number.POSITIVE_INFINITY;

    for (const node of nodes.values()) {
      const distance = haversineMeters(coordinates, node.coordinates);
      if (distance < distanceMeters) {
        nearest = node;
        distanceMeters = distance;
      }
    }

    return { node: nearest, distanceMeters };
  }

  function shortestPath(originId, destinationId, scenarioId, blockedEdgeId = null) {
    const distances = new Map([[originId, 0]]);
    const previous = new Map();
    const queue = new MinHeap();
    queue.push({ nodeId: originId, cost: 0 });

    while (queue.size > 0) {
      const current = queue.pop();
      if (current.cost !== distances.get(current.nodeId)) continue;
      if (current.nodeId === destinationId) break;

      for (const edge of adjacency.get(current.nodeId) ?? []) {
        if (edge.id === blockedEdgeId) continue;

        const neighborId = edge.from === current.nodeId ? edge.to : edge.from;
        const nextCost = current.cost + edgeTravelSeconds(edge, scenarioId);
        if (nextCost >= (distances.get(neighborId) ?? Number.POSITIVE_INFINITY)) continue;

        distances.set(neighborId, nextCost);
        previous.set(neighborId, { nodeId: current.nodeId, edge });
        queue.push({ nodeId: neighborId, cost: nextCost });
      }
    }

    if (!distances.has(destinationId)) return null;

    const pathNodes = [destinationId];
    const pathEdges = [];
    let currentId = destinationId;

    while (currentId !== originId) {
      const step = previous.get(currentId);
      if (!step) return null;
      pathEdges.push(step.edge);
      currentId = step.nodeId;
      pathNodes.push(currentId);
    }

    pathNodes.reverse();
    pathEdges.reverse();

    return {
      coordinates: pathNodes.map((nodeId) => nodes.get(nodeId).coordinates),
      edges: pathEdges,
      distanceMeters: pathEdges.reduce((total, edge) => total + edge.distanceMeters, 0),
      travelSeconds: distances.get(destinationId)
    };
  }

  function routeBetween(origin, destination, scenarioId = "baseline") {
    const start = nearestNode(origin.coordinates);
    const end = nearestNode(destination.coordinates);
    const baselinePath = shortestPath(start.node.id, end.node.id, scenarioId);

    if (!baselinePath) {
      return {
        status: "unavailable",
        origin: origin.label,
        destination: destination.label,
        reason: "No connected route exists between the nearest mapped road segments."
      };
    }

    let route = baselinePath;
    let blockedSegment = null;

    if (scenarioId === "closure" && baselinePath.edges.length > 0) {
      const edgeToClose = baselinePath.edges.reduce((longest, edge) =>
        edge.distanceMeters > longest.distanceMeters ? edge : longest
      );
      blockedSegment = {
        roadName: edgeToClose.roadName,
        roadType: edgeToClose.roadType,
        osmId: edgeToClose.osmId
      };
      route = shortestPath(start.node.id, end.node.id, scenarioId, edgeToClose.id);

      if (!route) {
        return {
          status: "unavailable",
          origin: origin.label,
          destination: destination.label,
          reason: `No detour is available around the simulated closure on ${blockedSegment.roadName}.`,
          blockedSegment
        };
      }
    }

    const roadNames = [...new Set(route.edges.map((edge) => edge.roadName))];

    return {
      status: "available",
      scenarioId,
      origin: origin.label,
      destination: destination.label,
      coordinates: route.coordinates,
      distanceMeters: Math.round(route.distanceMeters),
      distanceKm: Number((route.distanceMeters / 1000).toFixed(2)),
      estimatedMinutes: Math.max(1, Math.round(route.travelSeconds / 60)),
      snapDistanceMeters: Math.round(start.distanceMeters + end.distanceMeters),
      edgeCount: route.edges.length,
      roadNames,
      blockedSegment
    };
  }

  return {
    nodeCount: nodes.size,
    edgeCount: edges.length,
    routeBetween,
    calculateRoutes(scenarioId = "baseline") {
      return ROUTE_PRESETS.map((preset) => ({
        id: preset.id,
        ...routeBetween(preset.origin, preset.destination, scenarioId)
      }));
    }
  };
}
