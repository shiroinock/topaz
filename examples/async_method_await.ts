/// <reference lib="es2015.promise" />

interface AsyncGetterWithAwait {
  value(delta: number): Promise<number>;
}

class AsyncCounterWithAwait implements AsyncGetterWithAwait {
  base: number = 1;

  async value(delta: number): Promise<number> {
    console.log("method before await");
    const a = await Promise.resolve(20);
    console.log("method between awaits");
    let b = await Promise.resolve(19);
    console.log("method after await");
    return this.base + a + b + delta;
  }
}

const getter: AsyncGetterWithAwait = new AsyncCounterWithAwait();
const result: Promise<number> = getter.value(2);

result.then((n: number): void => {
  console.log("then method await");
  console.log(n);
});

console.log("sync tail");
