/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

function combine(sum: number, right: number, currentValue: number): number {
  console.log("combine");
  console.log(sum);
  console.log(right);
  console.log(currentValue);
  return sum * 100 + right * 10 + currentValue;
}

async function answer(): Promise<number> {
  const values: Array<number> = [0];
  return combine(
    await Promise.resolve(mark("left", 1)) + (values[0] = await Promise.resolve(mark("assign", 2))),
    await Promise.resolve(mark("right", 3)),
    values[0],
  );
}

answer().then((value: number): void => {
  console.log("then");
  console.log(value);
});

console.log("sync tail");
