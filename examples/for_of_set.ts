// Phase 1.5-3.5g: for-of over Set<T> (plain RHS, .values(), .keys()).
// Iteration order is hash-dependent, so tests aggregate (sum / length / flag).

interface Named {
  name: string;
}

class Box implements Named {
  name: string;
  value: number;
  constructor(n: string, v: number) {
    this.name = n;
    this.value = v;
  }
}

function sumSet(s: Set<number>): number {
  let total: number = 0;
  for (const x of s) {
    total = total + x;
  }
  return total;
}

function sumViaValues(s: Set<number>): number {
  let total: number = 0;
  for (const x of s.values()) {
    total = total + x;
  }
  return total;
}

function sumViaKeys(s: Set<number>): number {
  let total: number = 0;
  for (const x of s.keys()) {
    total = total + x;
  }
  return total;
}

// Plain RHS, .values(), .keys() all iterate elements identically (JS treats
// Set.values === Set.keys; our binding type comes from setElem).
const nums: Set<number> = new Set<number>();
nums.add(1);
nums.add(2);
nums.add(3);
nums.add(4);
nums.add(5);
console.log(sumSet(nums));       // 15
console.log(sumViaValues(nums)); // 15
console.log(sumViaKeys(nums));   // 15

// Empty Set: cap == 0, loop body never runs.
const empty: Set<number> = new Set<number>();
console.log(sumSet(empty));      // 0

// break: at least one element matches the predicate.
nums.add(100);
let hit: number = -1;
for (const x of nums) {
  if (x < 10) continue;
  hit = x;
  break;
}
console.log(hit);                // 100

// String Set — aggregate by length so we don't depend on FNV-1a ordering.
const words: Set<string> = new Set<string>();
words.add("alpha");
words.add("beta");
words.add("gamma");
let totalLen: number = 0;
for (const w of words) {
  totalLen = totalLen + w.length;
}
console.log(totalLen);           // 5 + 4 + 5 = 14

// Tombstones must be skipped: delete some elements then walk.
const t: Set<number> = new Set<number>();
t.add(1); t.add(2); t.add(3); t.add(4); t.add(5);
t.delete(3);
t.delete(5);
let kept: number = 0;
for (const x of t) {
  kept = kept + x;
}
console.log(kept);               // 1 + 2 + 4 = 7

// Class instances — reference identity Set, sum a numeric field.
const a: Box = new Box("a", 10);
const b: Box = new Box("b", 20);
const c: Box = new Box("c", 30);
const boxes: Set<Box> = new Set<Box>();
boxes.add(a);
boxes.add(b);
boxes.add(c);
let valSum: number = 0;
for (const box of boxes) {
  valSum = valSum + box.value;
}
console.log(valSum);             // 60

// Interface element Set — vtable-free field access (just `.name`).
const ifs: Set<Named> = new Set<Named>();
ifs.add(a);
ifs.add(b);
let nameLen: number = 0;
for (const n of ifs) {
  nameLen = nameLen + n.name.length;
}
console.log(nameLen);            // 1 + 1 = 2

// Nested for-of with two different Sets. Body uses both bindings, so the
// result is independent of hash order: each `x` is summed once per inner
// iteration (3 times), each `y` once per outer iteration (6 times).
// (1+2+3+4+5+100) * 3 + (1+2+4) * 6 = 115*3 + 7*6 = 345 + 42 = 387.
let cross: number = 0;
for (const x of nums) {
  for (const y of t) {
    cross = cross + x + y;
  }
}
console.log(cross);              // 387

// Annotated binding type — must match elem type exactly.
let annot: number = 0;
for (const x: number of nums) {
  annot = annot + x;
}
console.log(annot);              // 1+2+3+4+5+100 = 115
