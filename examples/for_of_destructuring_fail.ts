// Phase 1.5-3.5h-entries: array destructuring in for-of binding is only
// supported for `.entries()` on Map / Set. Plain Array<T> iteration must
// use a single identifier binding.
const pairs: number[] = [1, 2, 3];
for (const [a, b] of pairs) {
  console.log(a);
  console.log(b);
}
