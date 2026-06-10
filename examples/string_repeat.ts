// Phase 3.57: String.prototype.repeat(count) lowers through the runtime prelude.
// ASCII-only Topaz strings repeat by byte length; count is a number and the
// runtime truncates positive fractions before allocation.

const a: string = "x".repeat(3);
console.log(a);
console.log(a.length);

const empty: string = "z".repeat(0);
console.log(empty.length);
console.log(empty === "");

console.log("ab".slice(0, 1).repeat(2));
console.log("pre-" + "ha".repeat(2));
console.log("q".repeat(2.9));
