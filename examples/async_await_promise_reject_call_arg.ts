/// <reference lib="es2015.promise" />

class AwaitRejectErr {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

function promisedError(label: string, message: string): Promise<AwaitRejectErr> {
  console.log(label);
  return Promise.resolve(new AwaitRejectErr(message));
}

async function declared(): Promise<void> {
  console.log("declared pre");
  const p: Promise<number> = Promise.reject(await promisedError("declared await", "declared error"));
  console.log("declared after");
  p.catch((e: unknown): number => {
    if (e instanceof AwaitRejectErr) {
      console.log(e.message);
    }
    return 11;
  }).then((n: number): void => {
    console.log("declared recovered");
    console.log(n);
  });
}

const arrow = async (): Promise<Promise<number>> => {
  console.log("arrow pre");
  return Promise.reject(await promisedError("arrow await", "arrow error"));
};

class Rejector {
  prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  async method(): Promise<Promise<string>> {
    console.log("method pre");
    return Promise.reject(await promisedError("method await", this.prefix));
  }
}

const expr: () => Promise<Promise<number>> = async function (): Promise<Promise<number>> {
  console.log("expr pre");
  return Promise.reject(await promisedError("expr await", "expr error"));
};

declared().then((): void => {
  console.log("declared outer then");
});

arrow().then((p: Promise<number>): void => {
  console.log("arrow outer then");
  p.then(
    (n: number): void => {
      console.log("missed arrow fulfilled");
      console.log(n);
    },
    (e: unknown): void => {
      if (e instanceof AwaitRejectErr) {
        console.log(e.message);
      }
      console.log("arrow rejected");
    },
  ).then(
    (): void => {},
  );
});

const rejector = new Rejector("method error");
rejector.method().then((p: Promise<string>): void => {
  console.log("method outer then");
  p.catch((e: unknown): string => {
    if (e instanceof AwaitRejectErr) {
      console.log(e.message);
    }
    return "method recovered";
  }).then((s: string): void => {
    console.log(s);
  });
});

expr().then((p: Promise<number>): void => {
  console.log("expr outer then");
  p.catch((e: unknown): number => {
    if (e instanceof AwaitRejectErr) {
      console.log(e.message);
    }
    return 44;
  }).then((n: number): void => {
    console.log("expr recovered");
    console.log(n);
  });
});

console.log("sync tail");
