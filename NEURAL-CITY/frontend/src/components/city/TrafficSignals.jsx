
export default function TrafficSignals() {
  const positions = [[2.5, 2], [-2.5, -2]];

  return (
    <>
      {positions.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 1.5, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 3, 8]} />
            <meshStandardMaterial color="#303844" />
          </mesh>

          <mesh position={[0, 3, 0]}>
            <boxGeometry args={[0.5, 1, 0.4]} />
            <meshStandardMaterial color="#171e2b" />
          </mesh>

          {["red", "yellow", "green"].map((color, j) => (
            <mesh key={color} position={[0, 3.3 - j * 0.3, 0]}>
              <sphereGeometry args={[0.1, 12, 12]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
              />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}
