// Phase 1.5-6 prep: nested pattern `{ a: { b } }` は明示 reject(rename と
// 同形なので rename 検査で先に拒否される)。
type Inner = { v: number };
type Outer = { inner: Inner; tag: string };
const o: Outer = { inner: { v: 42 }, tag: "deep" };
const { inner: { v }, tag } = o;
console.log(v);
console.log(tag);
