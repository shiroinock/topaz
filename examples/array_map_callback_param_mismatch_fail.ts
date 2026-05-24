// Phase 1.5-3.5f: an explicit param annotation on the callback must match
// the source array's element type.
const xs: Array<number> = [1, 2, 3];
const ys = xs.map((x: string) => x);
