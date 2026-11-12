
export default function Roads() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4, 35]} />
        <meshStandardMaterial color="#343b45" />
      </mesh>

      <mesh
        rotation={[-Math.PI / 2, 0, Math.PI / 2]}
        position={[0, 0.02, 0]}
      >
        <planeGeometry args={[4, 35]} />
        <meshStandardMaterial color="#343b45" />
      </mesh>

      {Array.from({ length: 12 }).map((_, i) => (
        <mesh
          key={i}
          position={[0, 0.04, -15 + i * 2.5]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[0.12, 1]} />
          <meshBasicMaterial color="white" />
        </mesh>
      ))}
    </>
  );
}
