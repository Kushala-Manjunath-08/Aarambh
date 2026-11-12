
export default function Pipelines() {
  return (
    <>
      {[-6, 0, 6].map((x) => (
        <mesh
          key={x}
          position={[x, 0.15, 0]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.15, 0.15, 25, 12]} />
          <meshStandardMaterial color="#168bdb" />
        </mesh>
      ))}
    </>
  );
}
