// Phase 1.5-6 prep #12: `String` is not a real binding — it is only
// recognized at call sites of the form `String.fromCharCode(...)`. Using
// `String` as a value must continue to fail with `unknown identifier`.
const s = String;
console.log(s);
