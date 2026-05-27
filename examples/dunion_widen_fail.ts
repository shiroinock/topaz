// Phase 1.5-6 prep #23 (negative): the reverse direction is rejected. A wider
// dunion is NOT assignable to a narrower one — `Shape` (circle | square |
// triangle) flowing into `Quad` (square | triangle) drops the `circle` variant
// the C side has no slot for, so the coercion has no sound lowering.

type Circle = { kind: "circle"; radius: number };
type Square = { kind: "square"; side: number };
type Triangle = { kind: "triangle"; base: number; height: number };

type Shape = Circle | Square | Triangle;
type Quad = Square | Triangle;

function anyShape(): Shape {
  return { kind: "circle", radius: 1 };
}

const s: Shape = anyShape();
const q: Quad = s; // ERROR: Circle is not a variant of Quad
console.log(q.kind);
