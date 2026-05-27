// Phase 1.5-6 prep: rest element `{ ...r }` は明示 reject。
type Triple = { a: number; b: number; c: number };
const t: Triple = { a: 1, b: 2, c: 3 };
const { a, ...rest } = t;
console.log(a);
console.log(rest.b);
