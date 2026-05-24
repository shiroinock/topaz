// Phase 1.5-3.5f-join: Array.join accepts at most one argument. A second
// argument is rejected (TS Array.join ignores extras, Topaz catches it).
const ns: Array<number> = [1, 2, 3];
const s: string = ns.join(",", "?");
console.log(s);
