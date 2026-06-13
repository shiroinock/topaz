/// <reference lib="es2015.promise" />

function mark(label: string, value: string): string {
  console.log(label);
  return value;
}

async function bad(): Promise<number> {
  const n: number = parseInt(mark("pre", "1") + await Promise.resolve("2"), 10);
  return n;
}

bad();
