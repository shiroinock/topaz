/// <reference lib="es2015.promise" />

class AsyncErr {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

export async function answer(): Promise<number> {
  console.log("async body");
  return 41;
}

async function sideEffect(): Promise<void> {
  console.log("async void body");
}

async function fails(): Promise<number> {
  throw new AsyncErr("boom");
}

const p: Promise<number> = answer();
p.then((n: number): number => {
  console.log("then answer");
  console.log(n + 1);
  return n + 1;
});

sideEffect().then((): void => {
  console.log("then void");
});

fails();
console.log("sync after calls");
