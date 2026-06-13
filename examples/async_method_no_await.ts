interface AsyncGetter {
  value(delta: number): Promise<number>;
}

class AsyncCounter implements AsyncGetter {
  base: number = 41;

  async value(delta: number): Promise<number> {
    console.log("method body");
    return this.base + delta;
  }
}

const getter: AsyncGetter = new AsyncCounter();
const result: Promise<number> = getter.value(1);

console.log("sync tail");

result.then((n: number): void => {
  console.log("then method");
  console.log(n);
});
