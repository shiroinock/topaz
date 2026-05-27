// Object literal は全 field が必須(optional `f?: T` も未対応)。`b` が
// 欠けているので "missing required property: b" で reject。
type Pair = { a: number; b: number };
const p: Pair = { a: 1 };
console.log(p.a);
