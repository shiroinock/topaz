// 宣言に無い field を渡すと "property 'c' does not exist" で reject。
// 構造的サブタイプ(超 set OK)は採用しない。
type Pair = { a: number; b: number };
const p: Pair = { a: 1, b: 2, c: 3 };
console.log(p.a);
