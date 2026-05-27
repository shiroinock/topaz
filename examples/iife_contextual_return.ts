// Phase 1.5-6 prep: IIFE `(() => { ... })(args)` の contextual return type 推論。
// 戻り型注釈の無い arrow を即時呼び出した時、その結果が要求される位置
// (variable init / return / 関数引数 / ternary arm) の expected 型を arrow の
// 戻り型として供給する。block body の return は currentReturnType=expected で
// emitWithExpected され、annotated param が無ければ実引数型が param に流れる。
// topaz_parser.ts:1593 の `(() => {...})()` blocker を解消するサブステップの回帰。

// (1) variable initializer site, block body, no return annotation (number)
const a: number = (() => {
  const k: number = 3;
  if (k > 2) return k * 10;
  return 0;
})();
console.log(a); // 30

// (2) variable initializer site (string)
const label: string = (() => {
  const n: number = 2;
  if (n === 2) return "two";
  return "other";
})();
console.log(label); // two

// (3) IIFE with args — params take contextual types from the argument types
const sum: number = ((x, y) => {
  return x + y;
})(3, 4);
console.log(sum); // 7

// (4) ternary false arm (self-host blocker shape): `cond ? a : (() => {...})()`
function endPos(useExpr: boolean, exprEnd: number, lastEnd: number): number {
  return useExpr ? exprEnd : (() => {
    if (lastEnd < 0) return 0;
    return lastEnd;
  })();
}
console.log(endPos(true, 5, 9)); // 5
console.log(endPos(false, 5, 9)); // 9
console.log(endPos(false, 5, -1)); // 0

// (5) function-argument site
function takeN(n: number): number {
  return n + 1;
}
console.log(takeN((() => {
  let acc: number = 0;
  let i: number = 0;
  while (i < 4) {
    acc = acc + i;
    i = i + 1;
  }
  return acc;
})())); // 0+1+2+3 = 6, +1 = 7
