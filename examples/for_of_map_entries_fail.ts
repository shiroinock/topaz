// Phase 1.5-3.5g negative: Map.entries() is rejected — it requires destructuring
// on the binding side (`for (const [k, v] of ...)`), which is unsupported.
const m: Map<string, number> = new Map<string, number>();
m.set("a", 1);
for (const e of m.entries()) {
  console.log(e);
}
