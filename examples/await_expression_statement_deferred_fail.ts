/// <reference lib="es2015.promise" />

function foo(n: number): void {
  console.log(n);
}

async function answer(): Promise<number> {
  foo(1 + await Promise.resolve(2));
  return 0;
}

answer();
