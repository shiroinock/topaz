/// <reference lib="es2015.promise" />

function foo(n: number): void {
  console.log(n);
}

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function answer(): Promise<number> {
  let middle = 2;
  foo(await Promise.resolve(1) + (middle = mark("middle", 2)) + await Promise.resolve(3));
  return 0;
}

answer();
