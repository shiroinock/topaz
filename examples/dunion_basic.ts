// Phase 1.5-3e: discriminated union (Circle | Square) narrowed via
// switch (s.kind). Each case body sees `s` cast to the concrete class so
// `s.radius` / `s.side` work without an explicit `instanceof`.
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

function area(s: Circle | Square): number {
  switch (s.kind) {
    case "circle":
      return s.radius * s.radius * 3;
    case "square":
      return s.side * s.side;
  }
  return -1;
}

function describe(s: Circle | Square): string {
  switch (s.kind) {
    case "circle":
      return "circle";
    case "square":
      return "square";
  }
  return "?";
}

const c: Circle | Square = new Circle(2);
const sq: Circle | Square = new Square(3);
console.log(area(c));
console.log(area(sq));
console.log(describe(c));
console.log(describe(sq));

// Round-trip: the discriminator field is readable on the unnarrowed union.
console.log(c.kind);
console.log(sq.kind);

// Re-bind a let to a different variant — flow narrowing is per-block, so
// after the assignment the binding stays a Circle | Square.
let shape: Circle | Square = new Circle(5);
switch (shape.kind) {
  case "circle":
    console.log(shape.radius);
    break;
  case "square":
    console.log(shape.side);
    break;
}
shape = new Square(7);
switch (shape.kind) {
  case "circle":
    console.log(shape.radius);
    break;
  case "square":
    console.log(shape.side);
    break;
}
