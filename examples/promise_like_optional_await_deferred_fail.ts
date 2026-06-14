/// <reference lib="es2018.promise" />

async function read(value: PromiseLike<number> | undefined): Promise<number> {
  if (value === undefined) {
    return 0;
  }
  const n = await value;
  return n + 2;
}

read(undefined).then((n: number): void => {
  console.log("optional missing");
  console.log(n);
});

read(Promise.resolve(30)).then((n: number): void => {
  console.log("optional present");
  console.log(n);
});

console.log("sync tail");
