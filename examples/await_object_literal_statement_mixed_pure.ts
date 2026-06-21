/// <reference lib="es2015.promise" />

class Box {
  value: number;

  constructor(value: number) {
    this.value = value;
  }
}

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function answer(): Promise<void> {
  const stable = 2;
  const box = new Box(5);
  ({
    left: await Promise.resolve(mark("left", 1)),
    middle: stable + box.value,
    right: await Promise.resolve(mark("right", 3)),
  });
  console.log("done");
}

answer().then((): void => {
  console.log("then");
});

console.log("sync tail");
