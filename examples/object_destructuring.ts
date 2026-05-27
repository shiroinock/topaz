// Phase 1.5-6 prep: object destructuring `const { a, b } = expr;` を
// `<recv-ty> __t = expr; const <T1> a = __t.<a>; const <T2> b = __t.<b>;`
// の連鎖に lowering。receiver は class (anonymous / 通常 / generic monomorph)
// または interface(後者は vtable getter 経由)。property rename / default
// value / rest / nested pattern / pattern annotation は明示 reject。
// src/codegen.ts では `declareVar` / `resolveOptionalReceiver` 等 14 箇所が
// この機能を使う。

// (1) anon class からの基本 destructuring。
type Pair = { a: number; b: number };
const p: Pair = { a: 3, b: 4 };
const { a, b } = p;
console.log(a);             // 3
console.log(b);             // 4
console.log(a + b);         // 7

// (2) scalar 混在 3 field の anon class。
type Triple = { num: number; flag: boolean; label: string };
const tri: Triple = { num: 7, flag: true, label: "hi" };
const { num, flag, label } = tri;
console.log(num);           // 7
console.log(flag);          // true
console.log(label);         // hi

// (3) 通常 class からの destructuring。
class Point {
  x: number = 0;
  y: number = 0;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}
const pt = new Point(5, 9);
const { x, y } = pt;
console.log(x);             // 5
console.log(y);             // 9

// (4) 関数戻り値からの destructuring(src/codegen.ts の主要パターン)。
function makeRange(): { left: number; right: number } {
  return { left: 100, right: 200 };
}
const { left, right } = makeRange();
console.log(left);          // 100
console.log(right);         // 200

// (5) 部分 destructuring(必要な field だけ拾う)。declared field の全 enumeration を強制しない。
type Big = { aa: number; bb: number; cc: number; dd: number };
const big: Big = { aa: 1, bb: 2, cc: 3, dd: 4 };
const { aa, cc } = big;
console.log(aa);            // 1
console.log(cc);            // 3

// (6) class field を持つ anon class — destructure 後も reference 共有。
class Box {
  v: number = 0;
  constructor(v: number) {
    this.v = v;
  }
}
type Holder = { inner: Box; tag: string };
const hol: Holder = { inner: new Box(10), tag: "first" };
const { inner, tag } = hol;
console.log(tag);           // first
console.log(inner.v);       // 10
inner.v = 99;
console.log(hol.inner.v);   // 99 (Box reference shared)

// (7) Array field destructured。reference 共有 (push が元側にも見える)。
type Bucket = { items: Array<number>; total: number };
const bk: Bucket = { items: [1, 2, 3], total: 6 };
const { items, total } = bk;
console.log(total);         // 6
console.log(items.length);  // 3
items.push(99);
console.log(bk.items.length); // 4 (storage shared)

// (8) for-of body 内で iteration ごとに destructure。
type Score = { player: string; pts: number };
const scores: Array<Score> = [
  { player: "a", pts: 10 },
  { player: "b", pts: 30 },
  { player: "c", pts: 20 },
];
let bestPts: number = 0;
let bestPlayer: string = "";
for (const s of scores) {
  const { player, pts } = s;
  if (pts > bestPts) {
    bestPts = pts;
    bestPlayer = player;
  }
}
console.log(bestPts);       // 30
console.log(bestPlayer);    // b

// (9) generic class monomorph からの destructuring。
class Wrap<T> {
  value: T;
  count: number = 0;
  constructor(value: T) {
    this.value = value;
  }
}
const w = new Wrap<number>(42);
w.count = 5;
const { value, count } = w;
console.log(value);         // 42
console.log(count);         // 5

// (10) `let { ... }` 経由で binding を再代入。各 binding は独立した変数。
//      scalar の destructure は値コピーなので、元 object には影響しない。
type Pos = { lo: number; hi: number };
const pos: Pos = { lo: 7, hi: 8 };
let { lo, hi } = pos;
lo = 99;
console.log(lo);            // 99
console.log(hi);            // 8
console.log(pos.lo);        // 7 (scalar copy)

// (11) 単 field destructure(`const { sig } = ...;` パターン)。
type Wrapped = { sig: number; extra: string };
const ww: Wrapped = { sig: 42, extra: "drop" };
const { sig } = ww;
console.log(sig);           // 42

// (12) interface receiver の destructure。fat pointer 経由で vtable getter を呼ぶ。
interface Shape {
  area: number;
  perimeter: number;
}
class Rect implements Shape {
  area: number;
  perimeter: number;
  constructor(w: number, h: number) {
    this.area = w * h;
    this.perimeter = 2 * (w + h);
  }
}
const shape: Shape = new Rect(3, 4);
const { area, perimeter } = shape;
console.log(area);          // 12
console.log(perimeter);     // 14

// (13) NewExpression を直接 destructure(declareVar の特例経路と同じく
// emitExpression が NewExpression を OK 扱いするのを利用)。
class Origin {
  ox: number = 0;
  oy: number = 0;
  constructor(ox: number, oy: number) {
    this.ox = ox;
    this.oy = oy;
  }
}
const { ox, oy } = new Origin(50, 60);
console.log(ox);            // 50
console.log(oy);            // 60
