// Phase 1.5-3.5f-join: separator must be `string` (no number-to-string
// coercion). Passing a number is rejected at the call site.
const ns: Array<number> = [1, 2, 3];
const s: string = ns.join(0);
console.log(s);
