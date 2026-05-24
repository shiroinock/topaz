// Phase 1.5-3.5e: nested fn types in fn parameter / return positions are
// rejected — the typedef slot fills before all fn monomorphs are known.
const f: (g: (n: number) => number) => number = (g) => g(1);
