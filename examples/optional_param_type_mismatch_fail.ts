// The optional parameter still has a declared type (`number | undefined`),
// and an explicit argument must match. Passing a string here is rejected.
function f(a: number, b?: number): number {
  return a + (b ?? 0);
}
console.log(f(1, "two"));
