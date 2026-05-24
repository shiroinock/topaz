// Phase 1.5-3.5f-includes: Array.includes. callback-less, early-break on
// SameValueZero match. NaN === NaN for number (matches Map/Set key
// equality), strict byte compare for string, reference identity for class
// and iface.

// --- scalar number hit / miss ---
const xs: Array<number> = [1, 2, 3, 4, 5];
console.log(xs.includes(3));   // true
console.log(xs.includes(99));  // false

// --- SameValueZero: NaN matches NaN (0/0 produces NaN) ---
const nan: number = 0 / 0;
const withNan: Array<number> = [1, nan, 2];
console.log(withNan.includes(0 / 0));  // true — NaN === NaN under SameValueZero
console.log(withNan.includes(0));      // false

// --- string element ---
const names: Array<string> = ["alpha", "beta", "gamma"];
console.log(names.includes("beta"));     // true
console.log(names.includes("delta"));    // false

// --- boolean element ---
const flags: Array<boolean> = [false, true, false];
console.log(flags.includes(true));   // true
console.log(flags.includes(false));  // true

// --- class instance: reference identity ---
class Box {
  value: number;
  constructor(v: number) {
    this.value = v;
  }
}
const a: Box = new Box(1);
const b: Box = new Box(2);
const c: Box = new Box(3);
const boxes: Array<Box> = [a, b, c];
console.log(boxes.includes(b));         // true
console.log(boxes.includes(new Box(2))); // false — different instance, same field

// --- interface element: fat pointer .data identity ---
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
const s1: Square = new Square(4);
const s2: Square = new Square(5);
const shapes: Array<Shape> = [s1, s2];
console.log(shapes.includes(s1));  // true — coerced from class to iface
console.log(shapes.includes(new Square(4)));  // false — different instance

// --- empty array always misses ---
const empty: Array<number> = [];
console.log(empty.includes(0));  // false

// --- single-element array hit ---
const solo: Array<number> = [42];
console.log(solo.includes(42));  // true
console.log(solo.includes(43));  // false

// --- chained with .filter / .map ---
const evens: Array<number> = xs.filter((x) => x % 2 === 0);
console.log(evens.includes(2));  // true
console.log(evens.includes(3));  // false
const doubled: Array<number> = xs.map((x) => x * 2);
console.log(doubled.includes(10));  // true
console.log(doubled.includes(3));   // false
