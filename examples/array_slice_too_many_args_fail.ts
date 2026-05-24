// Phase 1.5-3.5f-slice: Array.slice accepts at most two arguments. A third
// argument should be rejected (TS Array.slice ignores extras, but Topaz
// catches the mistake explicitly).
const xs: Array<number> = [1, 2, 3, 4, 5];
const ys: Array<number> = xs.slice(0, 2, 1);
console.log(ys.length);
