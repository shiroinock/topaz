Promise.resolve(1).then(
  (n: number): number => n + 1,
  (e: unknown): number => 0,
  (e: unknown): number => 1,
);
console.log("bad");
