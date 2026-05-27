// Phase 1.5-6 prep #10: String.charCodeAt argument must be `number`.
// Passing a `string` should be rejected.
const s: string = "hello";
console.log(s.charCodeAt("0"));
