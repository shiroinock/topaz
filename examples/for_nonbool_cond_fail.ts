// Phase 1.5-6 prep: condition 省略は許容するが、書いた場合は依然として strict
// boolean を要求する(truthy / falsy は型エラー)。`for (;;)` 解禁で boolean
// 厳格性が緩んでいないことを固める負例。
let x: number = 0;
for (; 5; ) {
  x = x + 1;
}
console.log(x);
