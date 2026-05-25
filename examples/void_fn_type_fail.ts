// Phase 1.5-6 prep: fn types cannot return `void` (arrow void return is
// gated together until Topaz needs callback-style void APIs).
let f: (n: number) => void = (n) => {
  console.log(n);
};

f(1);
