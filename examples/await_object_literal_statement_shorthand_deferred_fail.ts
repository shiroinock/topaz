/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function answer(): Promise<void> {
  const middle = 2;
  ({
    left: await Promise.resolve(mark("left", 1)),
    middle,
    right: await Promise.resolve(mark("right", 3)),
  });
  console.log("done");
}

answer().then((): void => {
  console.log("then");
});

console.log("sync tail");
