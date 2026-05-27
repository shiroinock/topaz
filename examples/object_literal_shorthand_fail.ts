// Shorthand `{ a, b }` は未対応(field 名 = identifier value のエイリアスは
// 別 syntax 経路、明示の `{ a: a, b: b }` を要求)。
type Pair = { a: number; b: number };
const a: number = 1;
const b: number = 2;
const p: Pair = { a, b };
console.log(p.a);
