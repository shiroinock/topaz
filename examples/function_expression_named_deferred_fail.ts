const f: (n: number) => number = function inner(n: number): number {
  if (n === 0) {
    return 0;
  }
  return inner(n - 1);
};

console.log(f(1));
