interface Shape {
  name: string;
  area(): number;
  scale(factor: number): number;
}

class Circle implements Shape {
  name: string;
  radius: number;
  constructor(r: number) {
    this.name = "circle";
    this.radius = r;
  }
  area(): number {
    return this.radius * this.radius * 4;
  }
  scale(factor: number): number {
    this.radius = this.radius * factor;
    return this.radius;
  }
}

class Square implements Shape {
  name: string;
  side: number;
  constructor(s: number) {
    this.name = "square";
    this.side = s;
  }
  area(): number {
    return this.side * this.side;
  }
  scale(factor: number): number {
    this.side = this.side * factor;
    return this.side;
  }
}

function describe(s: Shape): number {
  console.log(s.name);
  return s.area();
}

function makeShape(kind: number): Shape {
  if (kind === 1) {
    return new Circle(1);
  }
  return new Square(2);
}

console.log(describe(new Circle(3)));
console.log(describe(new Square(5)));

const a: Shape = new Circle(2);
console.log(a.area());
a.name = "renamed";
console.log(a.name);
console.log(a.scale(3));
console.log(a.area());

const b: Shape = new Square(4);
console.log(b.scale(2));
console.log(b.area());

const s1 = makeShape(1);
console.log(s1.area());
console.log(makeShape(2).area());
