/// <reference lib="es2015.promise" />

type Box = { a: { b: Array<number> } };

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

function wrap(label: string, value: number): number {
  console.log(label);
  console.log(value);
  return value + 10;
}

function readBox(box: Box): number {
  console.log("readBox");
  console.log(box.a.b[0]);
  return box.a.b[0] + 100;
}

function combine(a: number, b: number): number {
  console.log("combine");
  console.log(a);
  console.log(b);
  return a + b + 1000;
}

async function run(): Promise<number> {
  return combine(
    await Promise.resolve(mark("left", 1)) +
      wrap(
        "snapshot",
        readBox({
          a: {
            b: [...[wrap("nested", await Promise.resolve(mark("inner", 2)))]],
          },
        }),
      ),
    await Promise.resolve(mark("right", 3)),
  );
}

run().then((value: number): void => {
  console.log("then");
  console.log(value);
});

console.log("sync tail");
