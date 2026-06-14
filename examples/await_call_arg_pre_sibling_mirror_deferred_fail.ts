/// <reference lib="es2015.promise" />

function mark(label: string, value: boolean): boolean {
  console.log(label);
  return value;
}

function read(value: number): void {
  console.log(value);
}

async function bad(): Promise<void> {
  read((await Promise.resolve(true)) && mark("post", true) ? 1 : 2);
}

bad();
