// Phase 1.5-3.5h-spread: spread source elem type must match the
// destination's elem type EXACTLY (no per-element widening through spread).
const strs: Array<string> = ["a", "b"];
const dst: Array<number> = [1, ...strs, 2];
console.log(dst.length);
