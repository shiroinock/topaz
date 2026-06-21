/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  const values: Array<number> = [0];
  const total = await Promise.resolve(1) + (values[0] = 2) + await Promise.resolve(3);
  console.log(values[0]);
  return total;
}

answer().then((value: number): void => {
  console.log(value);
});
