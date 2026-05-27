// Phase 1.5-6 prep #25: 三項演算子の条件は厳格 boolean(`if` / `while` と同じ
// divergence)。number を truthy 条件にすると型エラーで reject。
let n: number = 5;
let x: number = n ? 1 : 2;
console.log(x);
