// Phase 1.5-6i prep: nested first-class function types. Inner fn typedefs
// must be emitted before outer fn typedefs so params / returns can reference
// complete fat-pointer structs.

const applyTwice: (g: (n: number) => number) => number = (g) => g(1) + g(2);
console.log(applyTwice((n) => n * 10));  // 30

const maker: (n: number) => (x: number) => number = (n) => (x) => n + x;
const add7: (x: number) => number = maker(7);
console.log(add7(5));  // 12

function runNested(
  fn: (g: (n: number) => number) => number,
  seed: number,
): number {
  return fn((n) => n + seed);
}

console.log(runNested((g) => g(3), 4));  // 7
