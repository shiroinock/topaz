// Phase 251: Array.map's optional second callback parameter is always number.
const xs: Array<number> = [1, 2, 3];
const ys = xs.map((x, i: string) => x);
