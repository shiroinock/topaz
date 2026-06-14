/// <reference lib="es2015.promise" />

type InitPayload = { nested: { left: number; stable: number; right: number } };
type ReturnPayload = { nested: { head: number; middle: number; tail: number } };

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function initializerObject(): Promise<number> {
  const stable = 5;
  const payload: InitPayload = {
    nested: {
      left: await Promise.resolve(mark("init left", 1)),
      stable,
      right: await Promise.resolve(mark("init right", 2)),
    },
  };
  const total = payload.nested.left + payload.nested.stable + payload.nested.right;
  console.log("init result");
  console.log(total);
  return total;
}

async function terminalReturnObject(): Promise<ReturnPayload> {
  const middle = 30;
  return {
    nested: {
      head: await Promise.resolve(mark("return head", 10)),
      middle,
      tail: await Promise.resolve(mark("return tail", 20)),
    },
  };
}

initializerObject().then((value: number): void => {
  console.log("init then");
  console.log(value);
});

terminalReturnObject().then((payload: ReturnPayload): void => {
  console.log("return then");
  console.log(payload.nested.head + payload.nested.middle + payload.nested.tail);
});

console.log("sync tail");
