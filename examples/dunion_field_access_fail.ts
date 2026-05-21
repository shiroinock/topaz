// Phase 1.5-3e: accessing a non-discriminator field on an unnarrowed
// dunion is rejected. Only `s.kind` is allowed; everything else requires
// switch (s.kind) narrowing.
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

const s: Circle | Square = new Circle(2);
console.log(s.radius);
