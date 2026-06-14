/// <reference lib="es2015.promise" />

function foo(n: number): void {
  console.log(n);
}

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function answer(): Promise<number> {
  foo(await Promise.resolve(2) + await Promise.resolve(mark("post", 1)));
  return 0;
}

answer();
