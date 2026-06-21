/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function answer(): Promise<void> {
  ({
    nested: {
      left: await Promise.resolve(mark("left", 1)),
      middle: mark("middle", 2),
      right: await Promise.resolve(mark("right", 3)),
      deeper: {
        tail: mark("tail", 4),
      },
    },
    label: 5,
  });
  console.log("done");
}

answer().then((): void => {
  console.log("then");
});

console.log("sync tail");
