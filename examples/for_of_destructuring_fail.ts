// Negative case for Phase 1.5-3.5b: array destructuring in for-of binding
// is unsupported (we only accept a single identifier name).
const pairs: number[] = [1, 2, 3];
for (const [x] of pairs) {
  console.log(x);
}
