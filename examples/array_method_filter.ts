// Phase 1.5-3.5f-filter: Array.filter. callback returns a strict boolean
// (no truthy/falsy coercion). dst Array<T> reuses src's monomorph, so no new
// Array monomorph is registered.

// --- basic filter on a scalar number array (keep odd values) ---
const xs: Array<number> = [1, 2, 3, 4, 5];
const odds: Array<number> = xs.filter((x) => x % 2 === 1);
console.log(odds.length);  // 3
console.log(odds[0]);  // 1
console.log(odds[2]);  // 5

// --- annotated callback (explicit param + return type) ---
const evens: Array<number> = xs.filter((x: number): boolean => x % 2 === 0);
console.log(evens.length);  // 2
console.log(evens[0]);  // 2
console.log(evens[1]);  // 4

// --- callback bound to a fn-typed variable ---
const positive: (n: number) => boolean = (n) => n > 0;
const ys: Array<number> = [-2, -1, 0, 1, 2];
const pos: Array<number> = ys.filter(positive);
console.log(pos.length);  // 2
console.log(pos[0]);  // 1
console.log(pos[1]);  // 2

// --- string element ---
const names: Array<string> = ["alpha", "beta", "gamma", "delta"];
const longNames: Array<string> = names.filter((s) => s.length >= 5);
console.log(longNames.length);  // 3
console.log(longNames[0]);  // alpha
console.log(longNames[2]);  // delta

// --- boolean element (identity predicate) ---
const flags: Array<boolean> = [true, false, true, true, false];
const trues: Array<boolean> = flags.filter((b) => b);
console.log(trues.length);  // 3
console.log(trues[0]);  // true
console.log(trues[2]);  // true

// --- captures outer scalar by value (threshold) ---
const threshold: number = 3;
const above: Array<number> = xs.filter((x) => x > threshold);
console.log(above.length);  // 2
console.log(above[0]);  // 4

// --- class element filter by field ---
class Box {
  value: number;
  constructor(v: number) {
    this.value = v;
  }
}
const boxes: Array<Box> = [new Box(1), new Box(50), new Box(100), new Box(7)];
const big: Array<Box> = boxes.filter((b) => b.value >= 50);
console.log(big.length);  // 2
console.log(big[0].value);  // 50
console.log(big[1].value);  // 100

// --- empty array stays empty ---
const empty: Array<number> = [];
const filteredEmpty: Array<number> = empty.filter((x) => x > 0);
console.log(filteredEmpty.length);  // 0

// --- all-rejected returns an empty array (not null) ---
const none: Array<number> = xs.filter((x) => x > 100);
console.log(none.length);  // 0

// --- chained .filter().filter() ---
const chain: Array<number> = xs.filter((x) => x > 1).filter((x) => x < 5);
console.log(chain.length);  // 3
console.log(chain[0]);  // 2
console.log(chain[2]);  // 4

// --- .filter().map() interplay ---
const odd2: Array<number> = xs.filter((x) => x % 2 === 1).map((x) => x * 10);
console.log(odd2.length);  // 3
console.log(odd2[0]);  // 10
console.log(odd2[2]);  // 50
