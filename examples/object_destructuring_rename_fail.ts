// Phase 1.5-6 prep: property rename `{ a: x }` は明示 reject。
// (src/codegen.ts 内では `const { type, cName, initStr: vInit } = ...` の
// 1 箇所のみで使われており、self-hosting 着地時に書き直す方針 — 当面は受理しない。)
type Pair = { a: number; b: number };
const p: Pair = { a: 1, b: 2 };
const { a: x, b } = p;
console.log(x);
console.log(b);
