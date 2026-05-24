// Phase 1.5-3.5e: arrow functions + closure capture. fn type is `(p: T) => R`;
// arrows produce a fat pointer value `{ fn ptr, env ptr }`. Captures are
// by-value snapshots (divergent from JS by-reference closures).

// --- non-capturing arrow stored in a typed binding ---
const inc: (n: number) => number = (n) => n + 1;
console.log(inc(41));  // 42

const dbl: (n: number) => number = (n: number): number => {
  return n * 2;
};
console.log(dbl(21));  // 42

// --- multiple params + boolean return ---
const within: (lo: number, hi: number, x: number) => boolean = (lo, hi, x) => lo <= x && x <= hi;
console.log(within(0.0, 10.0, 5.0));   // true
console.log(within(0.0, 10.0, 20.0));  // false

// --- zero-arg arrow ---
const get7: () => number = () => 7;
console.log(get7());  // 7

// --- string return ---
const greet: (name: string) => string = (n) => `hello, ${n}`;
console.log(greet("topaz"));  // hello, topaz

// --- capture a scalar by value (mutation does NOT propagate) ---
let counter: number = 100;
const snapshot: () => number = () => counter;
counter = 999;
console.log(snapshot());  // 100  — divergent from JS

// --- capture multiple scalars ---
function makeAdder(base: number): (x: number) => number {
  return (x) => x + base;
}
const add5: (x: number) => number = makeAdder(5);
const add10: (x: number) => number = makeAdder(10);
console.log(add5(1));    // 6
console.log(add5(2));    // 7
console.log(add10(1));   // 11
console.log(add10(2));   // 12

// --- capture a class reference (the captured pointer is by-value, but the
// pointed-to fields are still mutable through the original reference) ---
class Box {
  value: number;
  constructor(v: number) {
    this.value = v;
  }
}

const box: Box = new Box(50);
const getBox: () => number = () => box.value;
console.log(getBox());  // 50
box.value = 75;
console.log(getBox());  // 75  — same underlying object

// --- pass an arrow to a function that takes a fn parameter ---
function apply(f: (n: number) => number, n: number): number {
  return f(n);
}
console.log(apply((x) => x * x, 6));  // 36
console.log(apply(inc, 99));          // 100

// --- arrow can call another fn-typed binding it captured ---
function makeRunner(op: (x: number) => number): (n: number) => number {
  return (n) => op(n) + 1;
}
const runnerSq: (n: number) => number = makeRunner((x) => x * x);
console.log(runnerSq(4));  // 17

// --- arrow returning a class-typed value ---
const mkBox: (v: number) => Box = (v) => new Box(v);
const made: Box = mkBox(123);
console.log(made.value);  // 123

// --- arrow that captures a string ---
const prefix: string = "topaz:";
const tag: (s: string) => string = (s) => prefix + s;
console.log(tag("ok"));  // topaz:ok
