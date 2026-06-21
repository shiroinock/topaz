/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  const values: Array<number> = [1];
  const total = await Promise.resolve(10) + (values[0] += 2) + await Promise.resolve(30);
  console.log(values[0]);
  return total;
}

answer().then((value: number): void => {
  console.log(value);
});
