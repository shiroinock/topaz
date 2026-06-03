// Phase 251: Array.map accepts one or two callback parameters, but not the
// JavaScript third array argument.
const xs: Array<number> = [1, 2, 3];
const ys = xs.map((x, y, arr) => x + y + arr.length);
