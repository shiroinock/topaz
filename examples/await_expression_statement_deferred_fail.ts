/// <reference lib="es2015.promise" />

function foo(n: number): void {
  console.log(n);
}

async function answer(): Promise<number> {
  foo(await Promise.resolve(1));
  return 0;
}

answer();
