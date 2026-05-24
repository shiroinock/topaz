// Phase 1.5-3.5g-array-fn: Array<fn> is unlocked, but Map / Set still reject
// fn elem because fn values have no defined equality / hash. The reject lands
// at typeFromAnnotation via mapOf() / setOf() returning undefined.
const m: Map<string, (n: number) => number> = new Map<string, (n: number) => number>();
m.set("inc", (n) => n + 1);
