/// <reference lib="es2015.promise" />

function part(label: string, value: number): Array<number> {
  console.log(label);
  return [value];
}

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function answer(): Promise<number> {
  const values: Array<number> = [
    ...part("prefix", 0),
    await Promise.resolve(mark("await one", 1)),
    ...part("middle", 2),
    await Promise.resolve(mark("await two", 3)),
    mark("tail", 4),
  ];
  console.log(values.length);
  console.log(values[0] + values[1] + values[2] + values[3] + values[4]);
  return values[2];
}

answer().then((value: number): void => {
  console.log("then");
  console.log(value);
});

console.log("sync tail");
