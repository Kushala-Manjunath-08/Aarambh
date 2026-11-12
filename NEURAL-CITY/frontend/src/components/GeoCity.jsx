import { useEffect, useMemo, useState } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const CENTER_LAT = 13.1007;
const CENTER_LON = 77.5963;

const HORIZONTAL_SCALE = 0.012;
const VERTICAL_SCALE = 0.055;

const SENSOR_POSITIONS = [
  [-19, 0, 18],
  [-9, 0, 20],
  [0, 0, 12],
  [-22, 0, 5],
  [-13, 0, 3],
  [-3, 0, -2]
];

const UTILITY_LINKS = [
  [-21, 1, 15, 1],
  [-21, 1, -3, 1],
  [-21, 1, -3, 17],
  [-12, 1, -3, 17],
  [-3, 1, -3, 17]
];

function project(lon, lat) {
  const x =
    (lon - CENTER_LON) *
    111320 *
    Math.cos((CENTER_LAT * Math.PI) / 180);

  const z = -(lat - CENTER_LAT) * 110540;

  return [
    x * HORIZONTAL_SCALE,
    z * HORIZONTAL_SCALE
  ];
}

function createShape(ring) {
  if (!ring || ring.length < 4) return null;

  const points = ring.slice(0, -1);
  const shape = new THREE.Shape();

  points.forEach(([lon, lat], index) => {
    const [x, z] = project(lon, lat);

    if (index === 0) {
      shape.moveTo(x, -z);
    } else {
      shape.lineTo(x, -z);
    }
  });

  shape.closePath();

  return shape;
}

function getBuildingHeight(properties, index) {
  const height = parseFloat(properties?.height);

  if (Number.isFinite(height) && height > 0) {
    return height;
  }

  const levels = parseFloat(properties?.["building:levels"]);

  if (Number.isFinite(levels) && levels > 0) {
    return levels * 3;
  }

  return 8 + (index % 6) * 2.5;
}

function createBuildingGeometry(feature, index) {
  const geometryType = feature.geometry?.type;
  const coordinates = feature.geometry?.coordinates;

  if (!coordinates) return [];

  const polygons =
    geometryType === "Polygon"
      ? [coordinates]
      : geometryType === "MultiPolygon"
        ? coordinates
        : [];

  const results = [];
  const height =
    getBuildingHeight(feature.properties, index) *
    VERTICAL_SCALE;

  for (const polygon of polygons) {
    const shape = createShape(polygon[0]);

    if (!shape) continue;

    for (let i = 1; i < polygon.length; i++) {
      const holePoints = polygon[i].slice(0, -1);

      if (holePoints.length < 3) continue;

      const hole = new THREE.Path();

      holePoints.forEach(([lon, lat], j) => {
        const [x, z] = project(lon, lat);

        if (j === 0) {
          hole.moveTo(x, -z);
        } else {
          hole.lineTo(x, -z);
        }
      });

      hole.closePath();
      shape.holes.push(hole);
    }

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false,
      curveSegments: 1
    });

    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0.02, 0);
    geometry.computeVertexNormals();

    results.push(geometry);
  }

  return results;
}

function createRoadGeometry(features) {
  const positions = [];

  function addLine(coords) {
    for (let i = 0; i < coords.length - 1; i++) {
      const [x1, z1] = project(coords[i][0], coords[i][1]);
      const [x2, z2] = project(coords[i + 1][0], coords[i + 1][1]);

      positions.push(
        x1, 0.06, z1,
        x2, 0.06, z2
      );
    }
  }

  features.forEach((feature) => {
    const geometry = feature.geometry;

    if (!geometry) return;

    if (geometry.type === "LineString") {
      addLine(geometry.coordinates);
    }

    if (geometry.type === "MultiLineString") {
      geometry.coordinates.forEach(addLine);
    }
  });

  const result = new THREE.BufferGeometry();

  result.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );

  result.computeBoundingSphere();

  return result;
}

function createRouteGeometry(coordinates) {
  const positions = [];

  for (let index = 0; index < coordinates.length - 1; index++) {
    const [x1, z1] = project(coordinates[index][0], coordinates[index][1]);
    const [x2, z2] = project(coordinates[index + 1][0], coordinates[index + 1][1]);

    positions.push(
      x1, 0.18, z1,
      x2, 0.18, z2
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.computeBoundingSphere();

  return geometry;
}

function ScenarioOverlays({ layers, scenario }) {
  const riskColor = scenario === "rain" ? "#ee766b" : "#f2ae54";
  const sensorColor = scenario === "rain" ? "#ffb46c" : "#62d9b2";
  const roadClosureColor = scenario === "closure" ? "#c95c5a" : "#d8a657";

  return (
    <group>
      {layers.risk && (
        <group>
          <mesh position={[-14, 0.075, 12]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[7, 40]} />
            <meshBasicMaterial color={riskColor} transparent opacity={scenario === "rain" ? 0.34 : 0.2} depthWrite={false} />
          </mesh>
          <mesh position={[-2, 0.075, 2]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[5, 40]} />
            <meshBasicMaterial color={riskColor} transparent opacity={scenario === "rain" ? 0.3 : 0.16} depthWrite={false} />
          </mesh>
          {scenario === "closure" && (
            <mesh position={[-9, 0.12, 7]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[1.5, 24]} />
              <meshBasicMaterial color={roadClosureColor} transparent opacity={0.75} depthWrite={false} />
            </mesh>
          )}
        </group>
      )}

      {layers.sensors && SENSOR_POSITIONS.map(([x, y, z], index) => (
        <group key={`sensor-${index}`} position={[x, y, z]}>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.22, 8]} />
            <meshBasicMaterial color={sensorColor} transparent opacity={0.75} />
          </mesh>
          <mesh position={[0, 0.28, 0]}>
            <sphereGeometry args={[0.2, 12, 12]} />
            <meshStandardMaterial color={sensorColor} emissive={sensorColor} emissiveIntensity={0.65} />
          </mesh>
          <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.28, 0.34, 20]} />
            <meshBasicMaterial color={sensorColor} transparent opacity={0.75} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}

      {layers.utilities && UTILITY_LINKS.map(([x1, z1, x2, z2], index) => {
        const centerX = (x1 + x2) / 2;
        const centerZ = (z1 + z2) / 2;
        const length = Math.hypot(x2 - x1, z2 - z1);
        const angle = -Math.atan2(z2 - z1, x2 - x1);

        return (
          <mesh
            key={`utility-${index}`}
            position={[centerX, 0.1, centerZ]}
            rotation={[0, angle, 0]}
          >
            <boxGeometry args={[length, 0.07, 0.07]} />
            <meshBasicMaterial color="#71aaff" transparent opacity={0.72} />
          </mesh>
        );
      })}
    </group>
  );
}

export default function GeoCity({
  layers,
  scenario,
  onStats,
  route
}) {
  const [cityData, setCityData] = useState(null);
  const [error, setError] = useState("");
  const routeGeometry = useMemo(
    () => createRouteGeometry(route?.coordinates ?? []),
    [route]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadCity() {
      try {
        const [buildingResponse, roadResponse] = await Promise.all([
          fetch("/data/buildings.geojson"),
          fetch("/data/roads.geojson")
        ]);

        if (!buildingResponse.ok || !roadResponse.ok) {
          throw new Error("Could not load the Yelahanka GeoJSON files.");
        }

        const [buildingData, roadData] = await Promise.all([
          buildingResponse.json(),
          roadResponse.json()
        ]);
        const buildingFeatures = buildingData.features ?? [];
        const roadFeatures = roadData.features ?? [];
        const geometries = [];

        buildingFeatures.forEach((feature, index) => {
          geometries.push(...createBuildingGeometry(feature, index));
        });

        const mergedBuildings =
          geometries.length > 0
            ? mergeGeometries(geometries, false)
            : null;

        geometries.forEach((geometry) => geometry.dispose());

        if (mergedBuildings) {
          mergedBuildings.computeVertexNormals();
        }

        const roads = createRoadGeometry(roadFeatures);

        if (!cancelled) {
          setCityData({
            buildings: mergedBuildings,
            roads,
            buildingCount: buildingFeatures.length,
            roadCount: roadFeatures.length
          });
          onStats?.({
            buildings: buildingFeatures.length,
            roads: roadFeatures.length
          });
        } else {
          mergedBuildings?.dispose();
          roads.dispose();
        }
      } catch (loadError) {
        console.error("NEURAL CITY GIS error:", loadError);
        if (!cancelled) {
          setError(loadError.message);
        }
      }
    }

    loadCity();

    return () => {
      cancelled = true;
    };
  }, [onStats]);

  useEffect(() => {
    return () => {
      cityData?.buildings?.dispose();
      cityData?.roads?.dispose();
    };
  }, [cityData]);

  useEffect(() => {
    return () => routeGeometry.dispose();
  }, [routeGeometry]);

  if (error) {
    return (
      <Html center>
        <div className="map-load-error" role="alert">
          <strong>City map unavailable</strong>
          <span>{error}</span>
        </div>
      </Html>
    );
  }

  if (!cityData) return null;

  return (
    <group>
      <mesh
        position={[0, -0.12, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[180, 180]} />
        <meshStandardMaterial color="#a8b99d" roughness={1} />
      </mesh>

      {layers.buildings && cityData.buildings && (
        <mesh
          geometry={cityData.buildings}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color="#d1d6ce"
            roughness={0.86}
          />
        </mesh>
      )}

      {layers.roads && (
        <lineSegments geometry={cityData.roads}>
          <lineBasicMaterial
            color={scenario === "closure" ? "#9e5550" : "#3c4a4b"}
            transparent
            opacity={0.88}
          />
        </lineSegments>
      )}

      {route?.status === "available" && (
        <lineSegments geometry={routeGeometry}>
          <lineBasicMaterial color="#f06c57" transparent opacity={1} />
        </lineSegments>
      )}

      <ScenarioOverlays layers={layers} scenario={scenario} />
    </group>
  );
}
