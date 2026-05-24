// Phase 1.5-3.5h-entries: Map.entries() requires destructuring binding on
// the for-of side — a single identifier binding has no synthetic [K, V]
// tuple type to receive, so it's rejected.
const m: Map<string, number> = new Map<string, number>();
m.set("a", 1);
for (const e of m.entries()) {
  console.log(e);
}
