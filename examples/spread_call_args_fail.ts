// Phase 1.5-3.5h-spread: spread in call arguments is rejected.
// Only array-literal spread is supported. Rewrite call-site spread as
// an explicit loop over the source array.
function sum(a: number, b: number, c: number): number {
  return a + b + c;
}
const xs: Array<number> = [1, 2, 3];
console.log(sum(...xs));
