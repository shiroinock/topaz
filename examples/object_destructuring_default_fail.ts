// Phase 1.5-6 prep: default value `{ a = 1 }` は明示 reject。
type Pair = { a: number; b: number };
const p: Pair = { a: 1, b: 2 };
const { a = 99, b } = p;
console.log(a);
console.log(b);
