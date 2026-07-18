/// <reference lib="es2015.promise" />

type Box = { prefix: number; xs: Array<number>; after: number; tail: number };

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

function items(value: number): Array<number> {
  console.log("items");
  console.log(value);
  return [value + 10];
}

function readBox(box: Box): number {
  console.log("readBox");
  console.log(box.prefix);
  console.log(box.xs[0]);
  console.log(box.after);
  console.log(box.tail);
  return box.prefix + box.xs[0] + box.after + box.tail;
}

async function makeBox(): Promise<Box> {
  return {
    prefix: mark("prefix", 1),
    xs: [...items(await Promise.resolve(mark("spread await", 2)))],
    after: mark("after spread", 3),
    tail: await Promise.resolve(mark("tail await", 4)),
  };
}

makeBox().then((box: Box): void => {
  console.log("then");
  console.log(readBox(box));
});

console.log("sync tail");
