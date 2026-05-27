// Phase 1.5-6 prep: contextual return type 推論の scope 境界の固定。
// IIFE の結果に expected 型が無い位置 (console.log の引数は narrowing 不要だが
// 型推論のみで emitWithExpected を経由しない) では block body から戻り型を
// 推論しないので、注釈無し arrow は依然 reject される。
// = 「contextual 推論であって body-walk 推論ではない」ことの回帰。
console.log((() => {
  const k: number = 5;
  return k * 2;
})());
