// Phase 1.5-3.5h-entries: Map.entries() is only allowed as the RHS of a
// for-of with destructuring binding. Binding it to a value has no synthetic
// [K, V] tuple type to receive.
const m: Map<string, number> = new Map<string, number>();
m.set("a", 1);
const e = m.entries();
console.log(e);
