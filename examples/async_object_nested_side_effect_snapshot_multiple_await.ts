/// <reference lib="es2015.promise" />

type Payload = {
  values: Array<number>;
  nested: { left: number; middle: number; right: number };
};

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function initializerNestedSnapshot(): Promise<number> {
  const payload: Payload = {
    values: [
      await Promise.resolve(mark("init array left", 1)),
      mark("init array middle", 2),
      await Promise.resolve(mark("init array right", 3)),
    ],
    nested: {
      left: await Promise.resolve(mark("init object left", 10)),
      middle: mark("init object middle", 20),
      right: await Promise.resolve(mark("init object right", 30)),
    },
  };
  const total = payload.values[0] + payload.values[1] + payload.values[2] + payload.nested.left + payload.nested.middle + payload.nested.right;
  console.log("init result");
  console.log(total);
  return total;
}

async function terminalReturnNestedSnapshot(): Promise<Payload> {
  return {
    values: [
      await Promise.resolve(mark("return array left", 100)),
      mark("return array middle", 200),
      await Promise.resolve(mark("return array right", 300)),
    ],
    nested: {
      left: await Promise.resolve(mark("return object left", 1000)),
      middle: mark("return object middle", 2000),
      right: await Promise.resolve(mark("return object right", 3000)),
    },
  };
}

initializerNestedSnapshot().then((value: number): void => {
  console.log("init then");
  console.log(value);
});

terminalReturnNestedSnapshot().then((payload: Payload): void => {
  console.log("return then");
  console.log(payload.values[0] + payload.values[1] + payload.values[2] + payload.nested.left + payload.nested.middle + payload.nested.right);
});

console.log("sync tail");
