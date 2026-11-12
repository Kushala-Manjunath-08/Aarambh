import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import GeoCity from "../GeoCity";

export default function CityScene({ layers, scenario, onStats, route }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{
        position: [-2, 72, 82],
        fov: 43,
        near: 0.1,
        far: 1000
      }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#b9c9bf"]} />
      <fog attach="fog" args={["#b9c9bf", 100, 250]} />

      <ambientLight intensity={1.05} />
      <hemisphereLight args={["#eff5ee", "#78836f", 1.25]} />
      <directionalLight
        position={[30, 65, 24]}
        intensity={2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />

      <Grid
        position={[0, -0.105, 0]}
        args={[180, 180]}
        cellSize={10}
        cellThickness={0.25}
        cellColor="#899b8e"
        sectionSize={50}
        sectionThickness={0.5}
        sectionColor="#788b7d"
        fadeDistance={130}
        fadeStrength={1}
        infiniteGrid={false}
      />

      <Suspense fallback={null}>
        <GeoCity layers={layers} scenario={scenario} onStats={onStats} route={route} />
      </Suspense>

      <OrbitControls
        makeDefault
        minDistance={18}
        maxDistance={190}
        maxPolarAngle={Math.PI / 2.05}
        target={[-8, 0, 9]}
        enableDamping
        dampingFactor={0.08}
      />
    </Canvas>
  );
}
