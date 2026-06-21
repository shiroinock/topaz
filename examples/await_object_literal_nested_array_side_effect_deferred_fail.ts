/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function answer(): Promise<void> {
  ({
    values: [
      await Promise.resolve(mark("left", 1)),
      mark("middle", 2),
      await Promise.resolve(mark("right", 3)),
      mark("tail", 4),
    ],
    label: 5,
  });
  console.log("done");
}

answer().then((): void => {
  console.log("then");
});

console.log("sync tail");
