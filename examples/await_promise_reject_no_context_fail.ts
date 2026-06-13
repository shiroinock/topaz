/// <reference lib="es2015.promise" />

class NoContextRejectErr {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

async function bad(): Promise<void> {
  const n = await Promise.reject(new NoContextRejectErr("no context"));
  console.log(n);
}

bad();
