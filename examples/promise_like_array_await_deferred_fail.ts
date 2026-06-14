/// <reference lib="es2018.promise" />

async function read(values: Array<PromiseLike<number>>): Promise<number> {
  const first: PromiseLike<number> = values[0];
  const n = await first;
  return n + 3;
}

const values: Array<PromiseLike<number>> = [];
values.push(Promise.resolve(40));

read(values).then((n: number): void => {
  console.log("array then");
  console.log(n);
});

console.log("sync tail");
