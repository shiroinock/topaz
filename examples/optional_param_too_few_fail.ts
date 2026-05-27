// Optional params allow trailing omission, but required args must still all
// be supplied. Passing fewer args than the leading required count is rejected.
function f(a: number, b: number, c?: number): number {
  return a + b + (c ?? 0);
}
console.log(f(1));
