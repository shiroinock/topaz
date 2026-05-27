// Passing more args than the total parameter count is rejected (the extra
// arg has no slot; optional doesn't mean variadic).
function f(a: number, b?: number): number {
  return a + (b ?? 0);
}
console.log(f(1, 2, 3));
