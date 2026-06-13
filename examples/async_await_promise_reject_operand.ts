/// <reference lib="es2015.promise" />

class RejectOperandErr {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

async function bindingReject(): Promise<void> {
  console.log("binding pre");
  const n: number = await Promise.reject(new RejectOperandErr("binding error"));
  console.log("binding missed");
  console.log(n);
}

async function declaredReturnReject(): Promise<number> {
  console.log("declared pre");
  return await Promise.reject(new RejectOperandErr("declared error"));
}

const arrowReturnReject = async (): Promise<string> => {
  console.log("arrow pre");
  return await Promise.reject(new RejectOperandErr("arrow error"));
};

class MethodRejector {
  constructor() {}

  async method(): Promise<number> {
    console.log("method pre");
    return await Promise.reject(new RejectOperandErr("method error"));
  }
}

bindingReject().catch((e: unknown): void => {
  if (e instanceof RejectOperandErr) {
    console.log(e.message);
  }
  console.log("binding caught");
});

declaredReturnReject()
  .catch((e: unknown): number => {
    if (e instanceof RejectOperandErr) {
      console.log(e.message);
    }
    return 11;
  })
  .then((n: number): void => {
    console.log("declared recovered");
    console.log(n);
  });

arrowReturnReject()
  .catch((e: unknown): string => {
    if (e instanceof RejectOperandErr) {
      console.log(e.message);
    }
    return "arrow recovered";
  })
  .then((s: string): void => {
    console.log(s);
  });

const methodRejector = new MethodRejector();
methodRejector
  .method()
  .catch((e: unknown): number => {
    if (e instanceof RejectOperandErr) {
      console.log(e.message);
    }
    return 22;
  })
  .then((n: number): void => {
    console.log("method recovered");
    console.log(n);
  });

console.log("sync tail");
