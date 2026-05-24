// Negative case for Phase 1.5-3.5b: for-of over Map should error with a
// hint pointing at Map.values() / .keys() not being supported yet.
const m: Map<string, number> = new Map<string, number>();
m.set("a", 1);
for (const v of m) {
  console.log(v);
}
