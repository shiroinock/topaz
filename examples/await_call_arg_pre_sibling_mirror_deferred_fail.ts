/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

function read(value: number): void {
  console.log(value);
}

async function bad(): Promise<void> {
  read(await Promise.resolve(2) + mark("post", 1));
}

bad();
