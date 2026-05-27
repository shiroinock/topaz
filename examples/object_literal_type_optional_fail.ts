// Optional `f?: T` は `T | undefined` への lowering と field 必須化 policy が
// 噛み合うため、現状は reject(必要なら `f: T | undefined` を明示)。
type Pair = { a: number; b?: number };
const p: Pair = { a: 1, b: 2 };
console.log(p.a);
