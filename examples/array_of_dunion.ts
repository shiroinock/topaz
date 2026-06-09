// Phase 1.5-6 prep #8: Array<dunion> as a first-class container element.
// The dunion typedef `{ topaz_string kind; void *data; }` is emitted before
// the Array monomorph macro so TOPAZ_ARRAY_DEFINE sees the complete struct.
// Element widening is automatic at .push / [i] = / array literal sites because
// emitWithExpected already has a class→dunion coercion path.

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

class Triangle {
  kind: "triangle";
  base: number;
  height: number;
  constructor(b: number, h: number) {
    this.kind = "triangle";
    this.base = b;
    this.height = h;
  }
}

type Shape = Circle | Square | Triangle;

function area(s: Shape): number {
  switch (s.kind) {
    case "circle":
      return s.radius * s.radius * 3;
    case "square":
      return s.side * s.side;
    case "triangle":
      return s.base * s.height / 2;
  }
  return -1;
}

// (1) push / read with variant auto-widening at .push.
const xs: Array<Shape> = [];
xs.push(new Circle(2));
xs.push(new Square(3));
xs.push(new Triangle(4, 5));
console.log(xs.length);

// (2) for-of with switch narrowing on each iteration.
let total: number = 0;
for (const s of xs) {
  total = total + area(s);
}
console.log(total);

// (3) [i] read and write.
xs[0] = new Triangle(6, 7);
console.log(area(xs[0]));

// (4) Array literal with mixed variants (context-typed).
const ys: Array<Shape> = [new Circle(1), new Square(2), new Triangle(3, 4)];
console.log(ys.length);
console.log(area(ys[0]));
console.log(area(ys[1]));
console.log(area(ys[2]));

// (5) discriminator field readable on the unnarrowed dunion read.
console.log(xs[1].kind);

// (6) .pop returns a dunion value.
const last: Shape = ys[ys.length - 1];
console.log(area(last));

// (7) reference identity is preserved through Array storage.
const c1: Circle = new Circle(9);
const arr2: Array<Shape> = [c1];
const elem: Shape = arr2[0];
switch (elem.kind) {
  case "circle":
    elem.radius = 99;
    break;
  case "square":
  case "triangle":
    break;
}
console.log(c1.radius);

// (8) Map<string, Shape> — dunion as Map value. The dunion typedef is shared
// across Array / Map / Set monomorphs (single canonical typeIdent), so the
// Map<string, Shape> macro picks up the same `{ kind, void *data }` struct as
// the Array above. .has + .delete + .size cover the bookkeeping path; full
// .get narrowing on `dunion | undefined` is gated on a later sub-step.
const m: Map<string, Shape> = new Map<string, Shape>();
m.set("a", new Circle(2));
m.set("b", new Square(3));
console.log(m.size);
console.log(m.has("a"));
console.log(m.has("missing"));
m.delete("a");
console.log(m.size);

// (9) Set<Shape> — reference identity on `.data` (same as Set<class>).
const set: Set<Shape> = new Set<Shape>();
const c2: Circle = new Circle(4);
set.add(c2);
console.log(set.size);
console.log(set.has(c2));
const c3: Circle = new Circle(4);
console.log(set.has(c3));

// (10) Array spread from a concrete variant Array into an Array<dunion>.
const circles: Array<Circle> = [new Circle(5), new Circle(6)];
const spreadShapes: Array<Shape> = [...circles, new Square(2)];
console.log(spreadShapes.length);
let spreadTotal: number = 0;
for (const shape of spreadShapes) {
  spreadTotal = spreadTotal + area(shape);
}
console.log(spreadTotal);
