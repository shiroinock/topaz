// Phase 1.5-6 prep: pattern 全体の type annotation `const { a, b }: T = ...`
// は明示 reject(initializer 型から推論する運用に統一)。
type Pair = { a: number; b: number };
const p: Pair = { a: 1, b: 2 };
const { a, b }: Pair = p;
console.log(a);
console.log(b);
