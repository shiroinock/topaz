/// <reference lib="es2015.promise" />

function numberPromise(label: string, value: number): Promise<number> {
  console.log(label);
  return Promise.resolve(value);
}

function keepNumberPromise(p: Promise<number>): Promise<number> {
  const q: Promise<number> = p;
  return q;
}

function keepNestedPromise(p: Promise<Promise<number>>): Promise<Promise<number>> {
  const q: Promise<Promise<number>> = p;
  return q;
}

async function declared(): Promise<Promise<number>> {
  const p = Promise.resolve(await numberPromise("declared pre", 11));
  console.log("declared after");
  return keepNumberPromise(p);
}

const arrow = async (): Promise<Promise<number>> => {
  return Promise.resolve(await numberPromise("arrow pre", 22));
};

class Resolver {
  id: number;

  constructor(id: number) {
    this.id = id;
  }

  async method(): Promise<void> {
    // @ts-expect-error Topaz keeps Promise<T> opaque here; TypeScript flattens this Promise.resolve call.
    const nested: Promise<Promise<number>> = Promise.resolve(
      await Promise.resolve(numberPromise("method pre", 33)),
    );
    const same: Promise<Promise<number>> = keepNestedPromise(nested);
    if (same === nested) {
      console.log("method nested");
    }
    console.log("method after");
  }
}

const expr: () => Promise<void> = async function (): Promise<void> {
  Promise.resolve(await numberPromise("expr pre", 44));
  console.log("expr after");
};

const resolver = new Resolver(1);

declared().then((p: Promise<number>): void => {
  console.log("declared then");
  p.then((value: number): void => {
    console.log(value);
  });
});

arrow().then((p: Promise<number>): void => {
  console.log("arrow then");
  p.then((value: number): void => {
    console.log(value);
  });
});

resolver.method().then((): void => {
  console.log("method then");
});

expr().then((): void => {
  console.log("expr then");
});

console.log("sync tail");
