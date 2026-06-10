// Phase 1.5-3.5f-slice: Array.slice(start?, end?). lowering snapshots recv,
// normalizes raw start / end via __topaz_slice_normalize (NaN = default,
// negative = len + n, clamp to [0, len]), then copies range to a fresh dst
// of the same monomorph.

// --- both bounds inside range ---
const xs: Array<number> = [10, 20, 30, 40, 50];
const a: Array<number> = xs.slice(1, 4);
console.log(a.length);  // 3
console.log(a[0]);  // 20
console.log(a[2]);  // 40

// --- start only (no end argument -> default = len) ---
const b: Array<number> = xs.slice(2);
console.log(b.length);  // 3
console.log(b[0]);  // 30
console.log(b[2]);  // 50

// --- no args copies the full array ---
const c: Array<number> = xs.slice();
console.log(c.length);  // 5
console.log(c[0]);  // 10
console.log(c[4]);  // 50

// --- negative start (counts from end) ---
const d: Array<number> = xs.slice(-2);
console.log(d.length);  // 2
console.log(d[0]);  // 40
console.log(d[1]);  // 50

// --- negative end ---
const e: Array<number> = xs.slice(0, -1);
console.log(e.length);  // 4
console.log(e[0]);  // 10
console.log(e[3]);  // 40

// --- negative start + negative end ---
const f: Array<number> = xs.slice(-3, -1);
console.log(f.length);  // 2
console.log(f[0]);  // 30
console.log(f[1]);  // 40

// --- start > end clamps to empty ---
const g: Array<number> = xs.slice(3, 1);
console.log(g.length);  // 0

// --- start past end clamps to empty ---
const h: Array<number> = xs.slice(99);
console.log(h.length);  // 0

// --- end past len clamps to len ---
const i: Array<number> = xs.slice(3, 99);
console.log(i.length);  // 2
console.log(i[0]);  // 40
console.log(i[1]);  // 50

// --- empty source stays empty ---
const empty: Array<number> = [];
const sliced: Array<number> = empty.slice(0, 5);
console.log(sliced.length);  // 0

// --- string element ---
const names: Array<string> = ["alpha", "beta", "gamma", "delta"];
const ns: Array<string> = names.slice(1, 3);
console.log(ns.length);  // 2
console.log(ns[0]);  // beta
console.log(ns[1]);  // gamma

// --- class element preserves reference identity ---
class Box {
  value: number;
  constructor(v: number) {
    this.value = v;
  }
}
const orig: Box = new Box(99);
const boxes: Array<Box> = [new Box(1), orig, new Box(3)];
const bs: Array<Box> = boxes.slice(1, 2);
console.log(bs.length);  // 1
console.log(bs[0].value);  // 99
// Mutating via the slice still affects the original element (same ref).
const sharedBox: Box = bs[0];
sharedBox.value = 777;
console.log(orig.value);  // 777

// --- chained .slice().slice() ---
const c2: Array<number> = xs.slice(1, 5).slice(0, 2);
console.log(c2.length);  // 2
console.log(c2[0]);  // 20
console.log(c2[1]);  // 30

// --- .filter().slice() interplay ---
const fs: Array<number> = xs.filter((x) => x >= 20).slice(0, 2);
console.log(fs.length);  // 2
console.log(fs[0]);  // 20
console.log(fs[1]);  // 30

// --- .slice() result is independent from source for length / push ---
const src: Array<number> = [1, 2, 3];
const dup: Array<number> = src.slice();
dup.push(99);
console.log(src.length);  // 3
console.log(dup.length);  // 4
console.log(dup[3]);  // 99
