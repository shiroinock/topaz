// Phase 1.5-3.5g-iterator: Iterator<T> as first-class value. `.values()` /
// `.keys()` on Map / Set yield an `Iterator<T>` fat pointer that can be bound,
// stored, and consumed via for-of (while-form lowering driven by `next()`).
//
// 9 cases:
//   (1) Map.values() bound, then for-of consumes it
//   (2) Map.keys() bound, then for-of consumes it
//   (3) Set bound directly via .values()
//   (4) Set bound via .keys() (same elem semantics as .values() in JS)
//   (5) Iterator<T> from function return value
//   (6) Empty Map / Set yield empty iter (loop body never runs)
//   (7) class V Map.values() iter — method dispatch on bound elem
//   (8) Annotated for-of binding `const x: number` matches iter elem
//   (9) Interleaving two iters from the same Map (independent state)

const m: Map<string, number> = new Map<string, number>();
m.set("a", 10);
m.set("b", 20);
m.set("c", 30);

// (1) Bound values iter, for-of consumes
const vs: Iterator<number> = m.values();
let sum1: number = 0;
for (const v of vs) {
  sum1 = sum1 + v;
}
console.log(sum1); // 60

// (2) Bound keys iter, for-of consumes — concat by length sum (hash-order
// independent)
const ks: Iterator<string> = m.keys();
let keyLen: number = 0;
for (const k of ks) {
  keyLen = keyLen + k.length;
}
console.log(keyLen); // 3 (each key is "a"/"b"/"c")

// (3) Set bound via .values()
const s: Set<number> = new Set<number>();
s.add(1);
s.add(2);
s.add(3);
const sit: Iterator<number> = s.values();
let setSum: number = 0;
for (const x of sit) {
  setSum = setSum + x;
}
console.log(setSum); // 6

// (4) Set bound via .keys() — JS yields elem either way
const skit: Iterator<number> = s.keys();
let setSum2: number = 0;
for (const x of skit) {
  setSum2 = setSum2 + x;
}
console.log(setSum2); // 6

// (5) Iterator<T> from function return
function makeIter(): Iterator<number> {
  const m2: Map<string, number> = new Map<string, number>();
  m2.set("x", 100);
  m2.set("y", 200);
  return m2.values();
}
let fnSum: number = 0;
for (const v of makeIter()) {
  fnSum = fnSum + v;
}
console.log(fnSum); // 300

// (6) Empty Map yields empty iter
const empty: Map<string, number> = new Map<string, number>();
const emptyIt: Iterator<number> = empty.values();
let didEnter: boolean = false;
for (const v of emptyIt) {
  didEnter = true;
  console.log(v); // never runs
}
console.log(didEnter); // false

// (7) class V Map — method dispatch on bound iter elem
class Box {
  value: number;
  constructor(v: number) {
    this.value = v;
  }
  bump(): number {
    return this.value + 1;
  }
}
const bm: Map<string, Box> = new Map<string, Box>();
bm.set("p", new Box(7));
bm.set("q", new Box(8));
const bvs: Iterator<Box> = bm.values();
let bumpSum: number = 0;
for (const b of bvs) {
  bumpSum = bumpSum + b.bump();
}
console.log(bumpSum); // 17

// (8) annotated binding matches iter elem
const vs8: Iterator<number> = m.values();
let count8: number = 0;
let touched8: number = 0;
for (const v8: number of vs8) {
  count8 = count8 + 1;
  touched8 = touched8 + v8;
}
console.log(count8); // 3
console.log(touched8); // 60 (10 + 20 + 30, hash-order independent sum)

// (9) two iters from same Map are independent
const m3: Map<string, number> = new Map<string, number>();
m3.set("aa", 1);
m3.set("bb", 2);
const it_a: Iterator<number> = m3.values();
const it_b: Iterator<number> = m3.values();
let sumA: number = 0;
let sumB: number = 0;
for (const v of it_a) {
  sumA = sumA + v;
}
for (const v of it_b) {
  sumB = sumB + v;
}
console.log(sumA + sumB); // 6
