/// <reference lib="es2015.promise" />

function foo(n: number): void {
  console.log(n);
}

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function answer(): Promise<number> {
  foo(mark("pre", 1) + await Promise.resolve(2));
  return 0;
}

answer();
