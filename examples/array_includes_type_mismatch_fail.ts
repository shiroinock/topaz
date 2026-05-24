// Phase 1.5-3.5f-includes: target type must match elem exactly. No implicit
// scalar coercion (number vs string).
const xs: Array<number> = [1, 2, 3];
const r = xs.includes("2");
