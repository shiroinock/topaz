// Phase 1.5-6i prep: fn types may return `void`, but `void` is still not a
// value type and cannot be used as a fn parameter type.
let f: (n: void) => number = (n): number => {
  return 1;
};

console.log(f());
