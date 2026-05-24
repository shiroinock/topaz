// Phase 1.5-3.5g: for-of over Map.values() / Map.keys().
// Iteration order is hash-dependent — all tests aggregate or filter.

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

const m: Map<string, number> = new Map<string, number>();
m.set("a", 10);
m.set("bb", 20);
m.set("ccc", 30);

// Walk values.
let valSum: number = 0;
for (const v of m.values()) {
  valSum = valSum + v;
}
console.log(valSum);             // 60

// Walk keys (string K) — aggregate by length.
let keyLenSum: number = 0;
for (const k of m.keys()) {
  keyLenSum = keyLenSum + k.length;
}
console.log(keyLenSum);          // 1 + 2 + 3 = 6

// Annotated binding type (must match V).
let annotated: number = 0;
for (const v: number of m.values()) {
  annotated = annotated + v;
}
console.log(annotated);          // 60

// Empty Map — cap == 0, skips entirely.
const empty: Map<string, number> = new Map<string, number>();
let zero: number = 0;
for (const v of empty.values()) {
  zero = zero + v;
}
console.log(zero);               // 0

// Map<number, string>: continue inside body.
const m2: Map<number, string> = new Map<number, string>();
m2.set(1, "one");
m2.set(2, "two");
m2.set(3, "three");
m2.set(4, "four");

let shortLen: number = 0;
for (const v of m2.values()) {
  if (v.length > 3) continue;
  shortLen = shortLen + v.length;
}
console.log(shortLen);           // "one" (3) + "two" (3) = 6

// Class value Map — call instance method on the bound value.
const sq: Map<string, Square> = new Map<string, Square>();
sq.set("a", new Square(3));
sq.set("b", new Square(4));
sq.set("c", new Square(5));
let areaSum: number = 0;
for (const s of sq.values()) {
  areaSum = areaSum + s.draw();
}
console.log(areaSum);            // 9 + 16 + 25 = 50

// Interface value Map — vtable dispatch through the fat-pointer binding.
const dr: Map<string, Drawable> = new Map<string, Drawable>();
dr.set("p", new Square(2));
dr.set("q", new Square(3));
let drawSum: number = 0;
for (const d of dr.values()) {
  drawSum = drawSum + d.draw();
}
console.log(drawSum);            // 4 + 9 = 13

// Tombstones from .delete() must be skipped.
const m3: Map<string, number> = new Map<string, number>();
m3.set("x", 100);
m3.set("y", 200);
m3.set("z", 300);
m3.delete("y");
let kept: number = 0;
for (const v of m3.values()) {
  kept = kept + v;
}
console.log(kept);               // 100 + 300 = 400

// Number-keyed Map: walk keys, aggregate.
const m4: Map<number, string> = new Map<number, string>();
m4.set(10, "a");
m4.set(20, "b");
m4.set(30, "c");
let keySum: number = 0;
for (const k of m4.keys()) {
  keySum = keySum + k;
}
console.log(keySum);             // 60

// break out of value iteration as soon as we find 20.
let found: number = -1;
for (const v of m.values()) {
  if (v === 20) {
    found = v;
    break;
  }
}
console.log(found);              // 20

// Nested: outer Map.values() x inner Array. Sum is order-independent
// (commutative), so hash order doesn't matter.
// m.values() = {10, 20, 30}, inner = [1, 2]
// total = 2*(10+20+30) + 3*(1+2) = 120 + 9 = 129
let nested: number = 0;
for (const v of m.values()) {
  for (const x of [1, 2]) {
    nested = nested + v + x;
  }
}
console.log(nested);             // 129
