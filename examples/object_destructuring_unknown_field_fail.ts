// Phase 1.5-6 prep: 存在しない field 名で destructure すると reject。
type Pair = { a: number; b: number };
const p: Pair = { a: 1, b: 2 };
const { a, missing } = p;
console.log(a);
console.log(missing);
