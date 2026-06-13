/// <reference lib="es2015.promise" />

class AsyncErr {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

async function bad(): Promise<Promise<void>> {
  const p = Promise.reject(await Promise.resolve(new AsyncErr("boom")));
  return Promise.resolve(p);
}

bad();
