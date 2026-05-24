// Phase 1.5-3.5f-includes: the second `fromIndex` argument is unsupported.
// Use `xs.slice(fromIndex).includes(target)` once `.slice` lands (1.5-3.5f-slice).
const xs: Array<number> = [1, 2, 3, 4, 5];
const r = xs.includes(3, 2);
