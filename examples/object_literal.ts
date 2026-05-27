// Phase 1.5-6 prep #5: object literal type (`type X = { a: T; b: U }`) +
// object literal expression (`{ a: 1, b: "x" }`)。TypeLiteral は alias RHS /
// 関数 param / 関数 return / class field / Array 等の任意の type 位置で受理、
// 同 shape の TypeLiteral は alphabetical sort key で dedupe して同 C struct。
// expression は contextually typed (`emitWithExpected`) で expected が
// anon class のときのみ受理、field は宣言順(alphabetical)に並べ替えて
// positional ctor を呼ぶ。

// (1) plain scalar record。alias 経由。
type Pair = { a: number; b: number };
const p: Pair = { a: 3, b: 4 };
console.log(p.a);            // 3
console.log(p.b);            // 4
console.log(p.a + p.b);      // 7

// (2) property order を反転しても OK(alphabetical sort で並ぶ)。
const q: Pair = { b: 40, a: 30 };
console.log(q.a);            // 30
console.log(q.b);            // 40

// (3) same shape は同 C struct に dedupe(`Pair` と `Pair2` が同型ならば
//     C 上は同じ anon_N が使われる)。値を相互代入できる。
type Pair2 = { a: number; b: number };
const r: Pair2 = p;
console.log(r.a);            // 3
console.log(r.b);            // 4

// (4) field の mutate。anon class は reference 型なので代入で storage 共有。
const s: Pair = { a: 1, b: 2 };
const t: Pair = s;
t.a = 100;
console.log(s.a);            // 100 (shared)
console.log(s.b);            // 2

// (5) string field。
type Person = { age: number; name: string };
const pe: Person = { name: "alice", age: 30 };
console.log(pe.name);        // alice
console.log(pe.age);         // 30

// (6) boolean / mixed scalar fields。
type Flag = { active: boolean; count: number; label: string };
const fl: Flag = { active: true, count: 5, label: "ok" };
console.log(fl.active);      // true
console.log(fl.count);       // 5
console.log(fl.label);       // ok

// (7) class field を持つ anon class。
class Pt {
  x: number = 0;
  y: number = 0;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}
type Box = { tag: string; origin: Pt };
const bx: Box = { tag: "first", origin: new Pt(7, 8) };
console.log(bx.tag);         // first
console.log(bx.origin.x);    // 7
console.log(bx.origin.y);    // 8

// (8) Array<T> field。
type Hist = { values: Array<number>; total: number };
const h: Hist = { values: [1, 2, 3, 4, 5], total: 15 };
console.log(h.values.length); // 5
console.log(h.values[2]);     // 3
console.log(h.total);         // 15

// (9) Map<K, V> field。
type Lookup = { table: Map<string, number>; defaultV: number };
const m1 = new Map<string, number>();
m1.set("a", 10);
m1.set("b", 20);
const lk: Lookup = { table: m1, defaultV: -1 };
console.log(lk.table.size);  // 2
const got = lk.table.get("a");
if (got !== undefined) console.log(got); // 10
console.log(lk.defaultV);    // -1

// (10) nested anon class (anon が anon を field に持つ)。
type Inner = { v: number };
type Outer = { inner: Inner; label: string };
const o: Outer = { inner: { v: 42 }, label: "deep" };
console.log(o.inner.v);      // 42
console.log(o.label);        // deep

// (11) anon を関数 param / return 型に inline で使う。alias 経由でなくても
//      同じ shape は同 C struct に dedupe される。
function origin(): { x: number; y: number } {
  return { x: 0, y: 0 };
}
function shiftX(p: { x: number; y: number }, d: number): { x: number; y: number } {
  return { x: p.x + d, y: p.y };
}
const o0 = origin();
console.log(o0.x);           // 0
console.log(o0.y);           // 0
const o1 = shiftX(o0, 5);
console.log(o1.x);           // 5
console.log(o1.y);           // 0

// (12) Array<anon class>。
type Hit = { score: number; name: string };
const hits: Array<Hit> = [];
hits.push({ score: 10, name: "a" });
hits.push({ score: 30, name: "b" });
hits.push({ score: 20, name: "c" });
let bestScore: number = 0;
let bestName: string = "";
for (const h of hits) {
  if (h.score > bestScore) {
    bestScore = h.score;
    bestName = h.name;
  }
}
console.log(bestScore);      // 30
console.log(bestName);       // b

// (13) anon class が class field と Array field の両方を持つ複合型。
class Counter {
  n: number = 0;
  bump(): number {
    this.n = this.n + 1;
    return this.n;
  }
}
type State = { counter: Counter; events: Array<string> };
const st: State = { counter: new Counter(), events: [] };
st.counter.bump();
st.counter.bump();
st.counter.bump();
st.events.push("hello");
st.events.push("world");
console.log(st.counter.n);   // 3
console.log(st.events.length); // 2
console.log(st.events[0]);   // hello
console.log(st.events[1]);   // world

// (14) readonly modifier を no-op として受理(class field と同方針)。
type ROPair = { readonly a: number; b: number };
const ro: ROPair = { a: 5, b: 10 };
console.log(ro.a);           // 5
ro.b = 99; // readonly は runtime 強制しない
console.log(ro.b);           // 99
