/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function answer(): Promise<void> {
  const stable = 5;
  ({
    values: [
      [
        await Promise.resolve(mark("left", 1)),
        stable,
      ],
      [
        await Promise.resolve(mark("middle", 2)),
        stable + 10,
      ],
      [
        await Promise.resolve(mark("right", 3)),
        stable + 20,
      ],
    ],
    label: stable + 20,
  });
  console.log("done");
}

answer().then((): void => {
  console.log("then");
});

console.log("sync tail");
