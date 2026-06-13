function observeNumberPromise(p: Promise<number>): string {
  const q: Promise<number> = p;
  if (p === q) {
    return "promise returned";
  }
  return "missing promise";
}

const chained: Promise<number> = Promise.resolve(41).then((n: number): number => {
  console.log("then number");
  console.log(n + 1);
  return n + 1;
});

Promise.resolve("ready").then((s: string): void => {
  console.log("then string");
  console.log(s);
});

console.log("sync");
console.log(observeNumberPromise(chained));
