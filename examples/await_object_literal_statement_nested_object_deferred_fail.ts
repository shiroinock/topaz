/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function answer(): Promise<void> {
  const stable = 5;
  ({
    nested: {
      left: await Promise.resolve(mark("left", 1)),
      stable,
      values: [stable, await Promise.resolve(mark("middle", 2))],
      deeper: {
        inner: stable + 3,
        right: await Promise.resolve(mark("right", 3)),
      },
    },
    label: stable + 10,
  });
  console.log("done");
}

answer().then((): void => {
  console.log("then");
});

console.log("sync tail");
