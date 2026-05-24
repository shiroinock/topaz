// Phase 1.5-3.5g-array-fn: Array<fn> is unlocked, but Map / Set still reject
// fn elem because fn values have no defined equality / hash. The reject lands
// at typeFromAnnotation via setOf() returning undefined.
const s: Set<(n: number) => number> = new Set<(n: number) => number>();
s.add((n) => n + 1);
