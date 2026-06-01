// Phase 1.5-6i prep: void-returning arrows must use block bodies so Topaz
// does not silently discard an expression result.
const f: (n: number) => void = (n): void => n + 1;

f(1);
