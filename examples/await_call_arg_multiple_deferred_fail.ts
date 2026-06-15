/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function answer(): Promise<number> {
  let counter: number = 0;
  return combine(
    await Promise.resolve(mark("left", 1)) + (counter = await Promise.resolve(mark("assign", 2))),
    await Promise.resolve(mark("right", 3)),
    readCounter(counter),
  );
}

function combine(a: number, b: number, counter: number): number {
  console.log("combine");
  console.log(a);
  console.log(b);
  console.log(counter);
  return a * 100 + b * 10 + counter;
}

function readCounter(value: number): number {
  console.log("read counter");
  console.log(value);
  return value;
}

answer().then((value: number): void => {
  console.log("then");
  console.log(value);
});

console.log("sync tail");
