// Phase 1.5-6 prep #10: String.slice argument must be `number`.
// Passing a `string` should be rejected at the call site.
const s: string = "hello";
const out: string = s.slice("0");
console.log(out);
