// Phase 1.5-3d: `T | undefined` の flow-sensitive narrowing。
// - `if (x !== undefined) { /* x: T */ }` の then 内 narrowing
// - `if (x === undefined) { /* x: undefined */ } else { /* x: T */ }` の else 内 narrowing
// - `if (x === undefined) return; /* x: T from here */` の early-exit narrowing
class Box {
  v: number;
  constructor(v: number) {
    this.v = v;
  }
}

interface Shape {
  area(): number;
}

class Square implements Shape {
  side: number;
  constructor(s: number) {
    this.side = s;
  }
  area(): number {
    return this.side * this.side;
  }
}

function getOrZero(b: Box | undefined): number {
  if (b === undefined) return 0;
  return b.v;
}

function getOrNeg(b: Box | undefined): number {
  if (b !== undefined) {
    return b.v;
  } else {
    return -1;
  }
}

function areaOrFallback(s: Shape | undefined): number {
  if (s === undefined) {
    return 7;
  }
  return s.area();
}

function throwIfMissing(b: Box | undefined): number {
  if (b === undefined) {
    throw new Box(99);
  }
  return b.v * 2;
}

let b1: Box | undefined = new Box(10);
let b2: Box | undefined = undefined;
console.log(getOrZero(b1));
console.log(getOrZero(b2));
console.log(getOrNeg(b1));
console.log(getOrNeg(b2));

if (b1 !== undefined) {
  console.log(b1.v);
}

if (b2 === undefined) {
  console.log(0);
} else {
  console.log(b2.v);
}

let s1: Shape | undefined = new Square(4);
let s2: Shape | undefined = undefined;
console.log(areaOrFallback(s1));
console.log(areaOrFallback(s2));

console.log(throwIfMissing(b1));

try {
  throwIfMissing(b2);
} catch (e: Box) {
  console.log(e.v);
}
