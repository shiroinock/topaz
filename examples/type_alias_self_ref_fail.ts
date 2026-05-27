// 純粋な自己参照 `type A = A;` は TypeLiteralNode の boundary が無く、
// SCC で recursive と marked されても pre-allocation 対象が無いので
// 既存の resolving flag で circular type alias として reject される。
type A = A;

const x: A = 0;
console.log(x);
