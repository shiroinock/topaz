/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  let value = 1;
  const total = await Promise.resolve(10) + (value += 2) + await Promise.resolve(30);
  console.log(value);
  return total;
}

answer().then((value: number): void => {
  console.log(value);
});
