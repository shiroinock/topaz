// Phase 1.5-6 prep #23: dunion -> wider dunion widening. A value typed as a
// narrow discriminated union (a subset of the target's variants, same
// discriminator) flows into a wider-dunion slot with no user cast. Both share
// the `{ kind, data }` fat layout, so coercion re-wraps the same tag + payload
// into the wider typedef. This unblocks the self-hosted parser's
// `const decl: Stmt = this.parseVarDeclBody(...)`, where the helper returns a
// 2-variant `VarDeclStmt | VarDestrDeclStmt` widened to the full `Stmt` union.

type Circle = { kind: "circle"; radius: number };
type Square = { kind: "square"; side: number };
type Triangle = { kind: "triangle"; base: number; height: number };

type Shape = Circle | Square | Triangle;

// returns the narrow 2-variant union
function makeRound(pick: boolean): Circle | Square {
  if (pick) {
    return { kind: "circle", radius: 2 };
  }
  return { kind: "square", side: 3 };
}

function area(s: Shape): number {
  switch (s.kind) {
    case "circle":
      return 3 * s.radius * s.radius;
    case "square":
      return s.side * s.side;
    case "triangle":
      return (s.base * s.height) / 2;
  }
  return -1;
}

// return-site widening: body produces a narrow union, return type is wider
function asShape(pick: boolean): Shape {
  const narrow: Circle | Square = makeRound(pick);
  return narrow;
}

// var-init widening: narrow `Circle | Square` into the wider `Shape`
const c: Circle | Square = makeRound(true);
const wide: Shape = c;
console.log(area(wide)); // circle r=2 -> 12

// argument-site widening: narrow union passed to a Shape param
const sq: Circle | Square = makeRound(false);
console.log(area(sq)); // square s=3 -> 9

// return-site widening
console.log(area(asShape(true))); // 12
console.log(area(asShape(false))); // 9
