// Phase 1.5-3e: accessing a non-discriminator field on an unnarrowed
// dunion is rejected. Only `s.kind` is allowed; everything else requires
// switch (s.kind) narrowing.
//
// Phase 1.5-6 prep (initializer narrowing): the dunion must be genuinely
// unnarrowed for this to reject — a function parameter is the canonical case
// (tsc rejects it too). A `const s: Circle | Square = new Circle(2)` would now
// narrow to Circle (matching tsc CFA), so `s.radius` there is accepted.
class Circle {
  kind: "circle";
  radius: number;
  constructor(r: number) {
    this.kind = "circle";
    this.radius = r;
  }
}

class Square {
  kind: "square";
  side: number;
  constructor(s: number) {
    this.kind = "square";
    this.side = s;
  }
}

function radiusOf(s: Circle | Square): number {
  return s.radius;
}

console.log(radiusOf(new Circle(2)));
