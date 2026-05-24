// Phase 1.5-3.5f: block-bodied arrow callbacks must declare an explicit
// return type (only expression bodies get body-based inference).
const xs: Array<number> = [1, 2, 3];
const ys = xs.map((x) => { return x + 1; });
