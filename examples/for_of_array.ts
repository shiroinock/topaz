// Phase 1.5-3.5b: for-of over Array<T>.
// Covers number / boolean / string / class / interface element types,
// break / continue / nested loops / empty array / let rebind /
// in-function for-of / class method mutation through the binding.

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

function sumNumbers(xs: number[]): number {
  let total: number = 0;
  for (const x of xs) {
    total = total + x;
  }
  return total;
}

function firstNegative(xs: number[]): number {
  for (const x of xs) {
    if (x < 0) return x;
  }
  return 0;
}

function countTrue(bs: boolean[]): number {
  let n: number = 0;
  for (const b of bs) {
    if (b) n = n + 1;
  }
  return n;
}

function joinNames(arr: Array<Named>): number {
  let total: number = 0;
  for (const s of arr) {
    console.log(s.name);
    total = total + s.area();
  }
  return total;
}

const nums: number[] = [1, 2, 3, 4, 5];
console.log(sumNumbers(nums));
console.log(firstNegative([10, 20, -7, 30]));

// Empty array: zero iterations.
const empty: number[] = [];
console.log(sumNumbers(empty));

// break in plain for-of.
let firstEven: number = -1;
for (const x of nums) {
  if (x % 2 === 0) {
    firstEven = x;
    break;
  }
}
console.log(firstEven);

// continue skips iterations.
let oddSum: number = 0;
for (const x of nums) {
  if (x % 2 === 0) continue;
  oddSum = oddSum + x;
}
console.log(oddSum);

// boolean elements with method-style accumulator.
const flags: boolean[] = [true, false, true, true, false];
console.log(countTrue(flags));

// string elements (immutable values, just print).
const words: string[] = ["alpha", "beta", "gamma"];
for (const w of words) {
  console.log(w);
}

// Nested for-of: cartesian sum.
let pairSum: number = 0;
for (const a of [10, 20]) {
  for (const b of [1, 2, 3]) {
    pairSum = pairSum + a + b;
  }
}
console.log(pairSum);

// class elements: mutate through the binding (reference semantics).
const cs: Counter[] = [new Counter(1), new Counter(2), new Counter(3)];
for (const c of cs) {
  c.bump(100);
}
console.log(cs[0].value);
console.log(cs[2].value);

// interface elements: vtable dispatch inside loop body.
const shapes: Array<Named> = [new Square(3), new Circle(2)];
console.log(joinNames(shapes));

// let binding: rebinding to a different value inside the body is allowed
// (the C-level local is reused per iteration; matches our no-closure-yet model).
let sawZero: boolean = false;
for (let n of [3, 0, 5]) {
  if (n === 0) sawZero = true;
  n = n + 1; // shadows the iteration value within the body — observable nowhere
}
console.log(sawZero);

// Array literal RHS (snapshot tmp ensures single evaluation).
let litCount: number = 0;
for (const x of [1, 1, 1, 1]) {
  litCount = litCount + x;
}
console.log(litCount);
