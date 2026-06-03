// Phase 1.5-3.5g-array-fn: arrow / fn values can be stored in Array<T>.
// `Array<(...) => U>` reuses the regular Array monomorph machinery; the
// macro expansion lands in a post-fn-typedef slot so the fat-pointer struct
// is a complete type by then. Calls flow through `topaz_array_<fn>_at` ->
// fn-value dispatch (`emitFnValueCall`), which evaluates the callee once.

// (1) push two arrows, dispatch through index access
const fs: Array<(n: number) => number> = [];
fs.push((n) => n + 1);
fs.push((n) => n * 10);
console.log(fs[0](5));   // 6
console.log(fs[1](5));   // 50

// (2) `.length` after push, plus rewrite via [i] = arrow
console.log(fs.length);  // 2
fs[0] = (n) => n - 100;
console.log(fs[0](5));   // -95

// (3) annotated arrow with capture
const bias: number = 3;
const adders: Array<(n: number) => number> = [];
adders.push((n: number) => n + bias);
adders.push((n: number) => n + bias * 2);
console.log(adders[0](10));  // 13
console.log(adders[1](10));  // 16

// (4) for-of iteration to sum results
const sums: Array<(n: number) => number> = [];
sums.push((n) => n);
sums.push((n) => n * 2);
sums.push((n) => n * 3);
let total: number = 0;
for (const f of sums) {
  total = total + f(10);
}
console.log(total);  // 60

// (5) Populate Array<fn> from another array via for-of + capture.
const seeds: Array<number> = [1, 2, 3];
const builders: Array<(n: number) => number> = [];
for (const x of seeds) {
  builders.push((n: number) => n + x);
}
console.log(builders.length);   // 3
console.log(builders[0](100));  // 101
console.log(builders[1](100));  // 102
console.log(builders[2](100));  // 103

// (6) Array<fn> passed as a function parameter, dispatched inside
function runAll(fns: Array<(n: number) => number>, seed: number): number {
  let acc: number = seed;
  for (const f of fns) {
    acc = f(acc);
  }
  return acc;
}
const pipeline: Array<(n: number) => number> = [];
pipeline.push((n) => n + 1);
pipeline.push((n) => n * 2);
pipeline.push((n) => n - 3);
console.log(runAll(pipeline, 10));  // ((10 + 1) * 2) - 3 = 19

// (7) `.pop` returns the fn value, callable inline
const stack: Array<(n: number) => number> = [];
stack.push((n) => n * n);
const popped: (n: number) => number = stack.pop();
console.log(popped(7));   // 49
console.log(stack.length); // 0

// (8) Different fn types -> different monomorphs, independent storage
const stringifiers: Array<(n: number) => string> = [];
stringifiers.push((n) => `n=${n}`);
stringifiers.push((n) => `n*2=${n * 2}`);
console.log(stringifiers[0](7));   // n=7
console.log(stringifiers[1](7));   // n*2=14
