// Phase 1.5-3.5h-entries: for-of over Map.entries() / Set.entries().
// Iteration order is hash-dependent — all tests aggregate or filter so
// expectations don't depend on slot order.

interface Drawable {
  draw(): number;
}

class Square implements Drawable {
  side: number;
  constructor(s: number) {
    this.side = s;
  }
  draw(): number {
    return this.side * this.side;
  }
}

// (1) Map<string, number>.entries() — sum keyLen*value across all pairs.
const m: Map<string, number> = new Map<string, number>();
m.set("a", 10);
m.set("bb", 20);
m.set("ccc", 30);
let weighted: number = 0;
for (const [k, v] of m.entries()) {
  weighted = weighted + k.length * v;
}
console.log(weighted);                   // 1*10 + 2*20 + 3*30 = 140

// (2) Number-keyed Map: sum of (k + v).
const m2: Map<number, number> = new Map<number, number>();
m2.set(1, 100);
m2.set(2, 200);
m2.set(3, 300);
let kvSum: number = 0;
for (const [k, v] of m2.entries()) {
  kvSum = kvSum + k + v;
}
console.log(kvSum);                      // (1+100) + (2+200) + (3+300) = 606

// (3) Map<string, class>: call instance method on value, key via .length.
const sq: Map<string, Square> = new Map<string, Square>();
sq.set("a", new Square(3));
sq.set("bb", new Square(4));
sq.set("ccc", new Square(5));
let weightedArea: number = 0;
for (const [k, s] of sq.entries()) {
  weightedArea = weightedArea + k.length * s.draw();
}
console.log(weightedArea);               // 1*9 + 2*16 + 3*25 = 116

// (4) Map<number, iface>: vtable dispatch on value, summing k * draw().
const dr: Map<number, Drawable> = new Map<number, Drawable>();
dr.set(10, new Square(2));
dr.set(20, new Square(3));
let drawSum: number = 0;
for (const [k, d] of dr.entries()) {
  drawSum = drawSum + k * d.draw();
}
console.log(drawSum);                    // 10*4 + 20*9 = 220

// (5) break early on a key match (still hash-order independent: the
// answer is just the value for "bb", regardless of when we hit it).
let found: number = -1;
for (const [k, v] of m.entries()) {
  if (k === "bb") {
    found = v;
    break;
  }
}
console.log(found);                      // 20

// (6) continue skips a key. Sum values for k.length != 2.
let filtered: number = 0;
for (const [k, v] of m.entries()) {
  if (k.length === 2) continue;
  filtered = filtered + v;
}
console.log(filtered);                   // 10 + 30 = 40

// (7) Empty Map — loop body never executes.
const empty: Map<string, number> = new Map<string, number>();
let zero: number = 0;
for (const [k, v] of empty.entries()) {
  zero = zero + k.length + v;
}
console.log(zero);                       // 0

// (8) Tombstones from .delete() must be skipped.
const m3: Map<string, number> = new Map<string, number>();
m3.set("x", 100);
m3.set("y", 200);
m3.set("z", 300);
m3.delete("y");
let kept: number = 0;
for (const [k, v] of m3.entries()) {
  kept = kept + k.length + v;
}
console.log(kept);                       // (1+100) + (1+300) = 402

// (9) Nested entries x Array — outer m, inner [1, 2].
//     each pair contributes (k.length + v) * (1 + 2 elements) twice.
//     = (1+10) + (1+10) + (2+20) + (2+20) + (3+30) + (3+30) + 6*x_sum
//     simpler: outer per-pair = k.len + v, inner adds x to each iteration.
//     total = sum over m of (2*(k.len+v) + (1+2)) = 2*sum(k.len+v) + 3*|m|
//           = 2*((1+10)+(2+20)+(3+30)) + 3*3 = 2*66 + 9 = 141.
let nested: number = 0;
for (const [k, v] of m.entries()) {
  for (const x of [1, 2]) {
    nested = nested + k.length + v + x;
  }
}
console.log(nested);                     // 141

// (10) `let` binding so we can reassign inside the loop body.
let lastV: number = 0;
for (let [k, v] of m.entries()) {
  v = v + 1;
  lastV = lastV + v;
}
console.log(lastV);                      // (10+1) + (20+1) + (30+1) = 63

// (11) Set<number>.entries() yields [elem, elem] pairs — both names see
//      the same value (JS semantics). Verify by accumulating both bindings
//      separately.
const s: Set<number> = new Set<number>();
s.add(5);
s.add(10);
s.add(15);
let aSum: number = 0;
let bSum: number = 0;
for (const [a, b] of s.entries()) {
  aSum = aSum + a;
  bSum = bSum + b;
}
console.log(aSum);                       // 30
console.log(bSum);                       // 30

// (12) Set<string>.entries() — exercise string elem path.
const ss: Set<string> = new Set<string>();
ss.add("hi");
ss.add("yo");
ss.add("ok");
let lenSum: number = 0;
for (const [a, b] of ss.entries()) {
  lenSum = lenSum + a.length + b.length;
}
console.log(lenSum);                     // 2*6 = 12

// (13) Map iteration where value is captured into outer var via closure
//      capture sanity (by-value semantics from 1.5-3.5e).
const adders: Array<(n: number) => number> = [];
for (const [k, v] of m.entries()) {
  adders.push((n: number) => n + v + k.length);
}
let acc: number = 0;
for (let i: number = 0; i < adders.length; i = i + 1) {
  acc = acc + adders[i](100);
}
// Each closure captured (v, k.length) at iteration time; calling with 100
// gives 100 + v + k.length per pair. Sum across all = 3*100 + (10+20+30) + (1+2+3)
// = 300 + 60 + 6 = 366.
console.log(acc);                        // 366
