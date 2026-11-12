
const buildings = [
  [-9, -8, 3, 6],
  [-5, -8, 2, 4],
  [5, -8, 3, 7],
  [9, -8, 2, 5],
  [-9, -2, 3, 5],
  [-5, -2, 2, 4],
  [5, -2, 3, 6],
  [9, -2, 2, 5],
  [-9, 8, 3, 5],
  [-5, 8, 2, 6],
  [5, 8, 3, 4],
  [9, 8, 2, 6],
];

export default function Buildings() {
  return (
    <>
      {buildings.map(([x, z, width, height], index) => (
        <mesh
          key={index}
          position={[x, height / 2, z]}
          castShadow
        >
          <boxGeometry args={[width, height, width]} />
          <meshStandardMaterial
            color={index % 2 === 0 ? "#c5d3dc" : "#d6c6b3"}
          />
        </mesh>
      ))}
    </>
  );
}
