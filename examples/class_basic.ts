class Point {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
  sum(): number {
    return this.x + this.y;
  }
  scale(factor: number): Point {
    return new Point(this.x * factor, this.y * factor);
  }
  shiftBy(other: Point): Point {
    return new Point(this.x + other.x, this.y + other.y);
  }
}

class Greeter {
  name: string;
  count: number;
  constructor(name: string) {
    this.name = name;
    this.count = 0;
  }
  greet(): string {
    this.count += 1;
    return "hello, " + this.name;
  }
}

function shift(p: Point, dx: number, dy: number): Point {
  return new Point(p.x + dx, p.y + dy);
}

const p = new Point(3, 4);
console.log(p.x);
console.log(p.y);
console.log(p.sum());

const q = p.scale(10);
console.log(q.x);
console.log(q.y);

p.x = 99;
console.log(p.x);
p.x += 1;
console.log(p.x);

const r = p;
r.y = 555;
console.log(p.y);

const s = shift(p, 1, 2);
console.log(s.x);
console.log(s.y);

const t = p.shiftBy(new Point(10, 20));
console.log(t.x);
console.log(t.y);

const g = new Greeter("topaz");
console.log(g.greet());
console.log(g.greet());
console.log(g.count);
