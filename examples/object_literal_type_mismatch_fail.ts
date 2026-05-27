// Field 型不一致は emitWithExpected 経由で reject。`b: number` の slot に
// string literal を渡すので "expected topaz_number, got topaz_string" で停止。
type Pair = { a: number; b: number };
const p: Pair = { a: 1, b: "two" };
console.log(p.a);
