// object literal type RHS は次サブステップ(構造的 record / Map / anonymous
// class の方針未確定)。現状 typeFromAnnotation で unsupported type として
// reject される。
type Pair = { a: number; b: number };

const p: Pair = { a: 1, b: 2 };
console.log(p.a);
