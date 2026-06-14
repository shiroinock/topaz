/// <reference lib="es2015.promise" />

type InitPayload = { values: Array<number>; label: number };
type ReturnPayload = { values: Array<number>; tail: number };

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

async function initializerObject(): Promise<number> {
  const stable = 5;
  const payload: InitPayload = {
    values: [
      await Promise.resolve(mark("init first", 1)),
      stable,
      await Promise.resolve(mark("init second", 2)),
    ],
    label: 10,
  };
  const total = payload.values[0] + payload.values[1] + payload.values[2] + payload.label;
  console.log("init result");
  console.log(total);
  return total;
}

async function terminalReturnObject(): Promise<ReturnPayload> {
  const stable = 30;
  return {
    values: [
      await Promise.resolve(mark("return first", 10)),
      stable,
      await Promise.resolve(mark("return second", 20)),
    ],
    tail: 40,
  };
}

initializerObject().then((value: number): void => {
  console.log("init then");
  console.log(value);
});

terminalReturnObject().then((payload: ReturnPayload): void => {
  console.log("return then");
  console.log(payload.values[0] + payload.values[1] + payload.values[2] + payload.tail);
});

console.log("sync tail");
