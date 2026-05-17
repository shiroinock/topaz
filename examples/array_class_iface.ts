class Counter {
  value: number;
  constructor(v: number) {
    this.value = v;
  }
  bump(d: number): number {
    this.value = this.value + d;
    return this.value;
  }
}

interface Named {
  name: string;
  area(): number;
}

class Square implements Named {
  name: string;
  side: number;
  constructor(s: number) {
    this.name = "square";
    this.side = s;
  }
  area(): number {
    return this.side * this.side;
  }
}

class Circle implements Named {
  name: string;
  radius: number;
  constructor(r: number) {
    this.name = "circle";
    this.radius = r;
  }
  area(): number {
    return this.radius * this.radius * 4;
  }
}

const cs: Counter[] = [new Counter(1), new Counter(2), new Counter(3)];
console.log(cs.length);
console.log(cs[0].value);
console.log(cs[1].bump(10));
console.log(cs[1].value);
cs.push(new Counter(99));
console.log(cs.length);
console.log(cs[3].value);
const last = cs.pop();
console.log(last.value);
console.log(cs.length);
cs[0] = new Counter(500);
console.log(cs[0].value);

const shapes: Array<Named> = [new Square(3), new Circle(2)];
console.log(shapes.length);
console.log(shapes[0].name);
console.log(shapes[0].area());
console.log(shapes[1].name);
console.log(shapes[1].area());
shapes.push(new Square(4));
console.log(shapes[2].area());
shapes[0] = new Circle(5);
console.log(shapes[0].name);
console.log(shapes[0].area());

const empty: Counter[] = [];
console.log(empty.length);
empty.push(new Counter(7));
console.log(empty[0].value);

const emptyShapes: Named[] = [];
emptyShapes.push(new Circle(1));
console.log(emptyShapes[0].name);
console.log(emptyShapes[0].area());
