// Phase 1.5-6 prep: 空 destructuring pattern `const {} = ...;` は no-op に
// なるが意味が無いので reject(typo の検出を兼ねる)。
type Pair = { a: number; b: number };
const p: Pair = { a: 1, b: 2 };
const {} = p;
console.log(p.a);
