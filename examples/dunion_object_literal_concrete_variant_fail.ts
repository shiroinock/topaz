// Phase 1.5-6 prep #11: a concrete-class variant of a dunion cannot be
// constructed via object literal — field declaration order is not preserved
// in the literal, so positional ctor matching is ambiguous. Use
// `new ConcreteClass(...)` instead.

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

type Shape = Circle | Square;

const xs: Array<Shape> = [];
xs.push({ kind: "circle", radius: 2 });
console.log(xs.length);
