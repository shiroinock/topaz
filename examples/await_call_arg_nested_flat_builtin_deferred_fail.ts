/// <reference lib="es2015.promise" />

function mark(label: string, value: string): string {
  console.log(label);
  return value;
}

async function bad(): Promise<number> {
  const n: number = parseInt(await Promise.resolve("1") + mark("post", "2"), 10);
  return n;
}

bad();
