// Phase 1.5-3.5g negative: Map.values() has no standalone value representation
// (no Iterator interface yet) — it only makes sense as a for-of RHS.
const m: Map<string, number> = new Map<string, number>();
m.set("a", 1);
const vs = m.values();
console.log(vs);
