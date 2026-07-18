/// <reference lib="es2015.promise" />

async function answer(): Promise<number> {
  const values: Array<number> = [1, 5];

  const normalIncrement = values[0]++;
  const normalDecrement = values[1]--;
  console.log(normalIncrement);
  console.log(values[0]);
  console.log(normalDecrement);
  console.log(values[1]);

  const total =
    await Promise.resolve(100) +
    (values[0]++) +
    (values[1]--) +
    await Promise.resolve(1000);
  console.log(values[0]);
  console.log(values[1]);
  return total;
}

answer().then((value: number): void => {
  console.log(value);
});
