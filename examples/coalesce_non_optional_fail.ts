// Negative case for Phase 1.5-3.5c: `??` requires the left operand to be
// `T | undefined`; applying it to a plain `T` is a type error.
const x: number = 42;
console.log(x ?? -1);
