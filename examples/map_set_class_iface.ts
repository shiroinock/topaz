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

// Map<string, ClassName>
const counters: Map<string, Counter> = new Map<string, Counter>();
counters.set("a", new Counter(1));
counters.set("b", new Counter(2));
counters.set("c", new Counter(3));
console.log(counters.size);
console.log(counters.get("b").value);
console.log(counters.get("a").bump(10));
console.log(counters.get("a").value);
console.log(counters.has("c"));
console.log(counters.has("z"));
counters.delete("b");
console.log(counters.size);
console.log(counters.has("b"));

// Map<number, InterfaceName> — value-position class -> interface coercion
const shapes: Map<number, Named> = new Map<number, Named>();
shapes.set(1, new Square(3));
shapes.set(2, new Circle(5));
console.log(shapes.size);
console.log(shapes.get(1).name);
console.log(shapes.get(1).area());
console.log(shapes.get(2).name);
console.log(shapes.get(2).area());
shapes.set(1, new Circle(2));
console.log(shapes.get(1).name);
console.log(shapes.get(1).area());

// Set<ClassName> — dedup by instance pointer
const seen: Set<Counter> = new Set<Counter>();
const c1: Counter = new Counter(11);
const c2: Counter = new Counter(22);
seen.add(c1);
seen.add(c2);
seen.add(c1); // same pointer; no-op
console.log(seen.size);
console.log(seen.has(c1));
console.log(seen.has(c2));
console.log(seen.has(new Counter(11))); // different instance, even with same value
seen.delete(c1);
console.log(seen.size);
console.log(seen.has(c1));

// Set<InterfaceName> — reference identity across interface views.
// Adding the same Square via class -> interface coercion and re-adding it
// through a different surface still resolves to the same .data pointer.
const named: Set<Named> = new Set<Named>();
const sq: Square = new Square(4);
const cr: Circle = new Circle(7);
named.add(sq);
named.add(cr);
named.add(sq); // dedup
console.log(named.size);
console.log(named.has(sq));
console.log(named.has(cr));
console.log(named.has(new Square(4))); // different instance
named.delete(cr);
console.log(named.size);
console.log(named.has(cr));

// Grow path: 60 distinct counters force at least one rehash from the
// initial cap of 8.
const big: Set<Counter> = new Set<Counter>();
for (let i: number = 0; i < 60; i = i + 1) {
  big.add(new Counter(i));
}
console.log(big.size);

// new Map() / new Set() context typing with class / interface element types.
const inferredMap: Map<string, Counter> = new Map();
inferredMap.set("x", new Counter(99));
console.log(inferredMap.get("x").value);

const inferredSet: Set<Named> = new Set();
inferredSet.add(new Circle(1));
console.log(inferredSet.size);
