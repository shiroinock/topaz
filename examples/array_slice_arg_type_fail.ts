// Phase 1.5-3.5f-slice: Array.slice argument must be `number`. Passing a
// `string` should be rejected at the call site.
const xs: Array<number> = [1, 2, 3];
const ys: Array<number> = xs.slice("0");
console.log(ys.length);
