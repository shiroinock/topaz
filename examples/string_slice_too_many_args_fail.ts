// Phase 1.5-6 prep #10: String.slice accepts at most two arguments.
// A third argument should be rejected (TS String.slice ignores extras,
// but Topaz catches the mistake explicitly).
const s: string = "hello";
const out: string = s.slice(0, 2, 1);
console.log(out);
