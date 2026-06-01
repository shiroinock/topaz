// Phase 1.5-6i prep: Array.map still cannot form Array<void>.
const xs: Array<number> = [1, 2];
const ys = xs.map((x): void => {
  console.log(x);
});

console.log(ys.length);
