/// <reference lib="es2015.promise" />

function part(label: string, value: number): Array<number> {
  console.log(label);
  return [value];
}

function items(label: string, value: number): Array<number> {
  console.log(label);
  console.log(value);
  return [value + 10];
}

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function answer(): Promise<number> {
  const values: Array<number> = [
    ...part("prefix", 0),
    ...items("items", await Promise.resolve(mark("spread await", 1))),
    await Promise.resolve(mark("later await", 2)),
    ...part("after spread", 3),
    mark("tail", 4),
  ];
  console.log(values.length);
  console.log(values[0] + values[1] + values[2] + values[3] + values[4]);
  return values[1];
}

answer().then((value: number): void => {
  console.log("then");
  console.log(value);
});

console.log("sync tail");
