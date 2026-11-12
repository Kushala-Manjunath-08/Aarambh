
const positions = [
  [-12, -10], [12, -10],
  [-12, 0], [12, 0],
  [-12, 10], [12, 10],
  [-3, 14], [3, 14]
];

export default function Trees() {
  return (
    <>
      {positions.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.8, 0]}>
            <cylinderGeometry args={[0.15, 0.2, 1.6, 8]} />
            <meshStandardMaterial color="#79543a" />
          </mesh>

          <mesh position={[0, 2, 0]}>
            <sphereGeometry args={[1, 12, 12]} />
            <meshStandardMaterial color="#287d4b" />
          </mesh>
        </group>
      ))}
    </>
  );
}
