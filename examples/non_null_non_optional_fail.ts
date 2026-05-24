// Negative case for Phase 1.5-3.5c: `!` on an already non-optional value is
// rejected (TS only warns; Topaz upgrades it to an error so the assertion
// always carries a runtime cost worth its weight).
const x: number = 42;
console.log(x!);
