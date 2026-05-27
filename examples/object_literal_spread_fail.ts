// Spread `...x` も未対応(structural merge は構造的 record の方向、anon class
// 等しい shape を組み立てる現方針とは噛み合わない)。
type Pair = { a: number; b: number };
const base: Pair = { a: 1, b: 2 };
const p: Pair = { ...base };
console.log(p.a);
