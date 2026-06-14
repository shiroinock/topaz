/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function answer(): Promise<void> {
  ({
    left: await Promise.resolve(1),
    middle: mark("middle", 2),
    right: await Promise.resolve(3),
  });
}

answer();
