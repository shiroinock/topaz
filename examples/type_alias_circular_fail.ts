// 循環参照は resolving フラグで検出して reject。
type A = B;
type B = A;

const x: A = 0;
console.log(x);
