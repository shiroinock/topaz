// Phase 1.5-6i prep: a void-returning fn value can be called as a statement,
// but the call result cannot flow into a value position.
const f: () => void = (): void => {
  console.log("side effect");
};

const n: number = f();
console.log(n);
