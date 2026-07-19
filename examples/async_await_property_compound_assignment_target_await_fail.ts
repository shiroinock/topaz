/// <reference lib="es2015.promise" />

class TargetAwaitBox {
  value: number = 0;
}

async function makeBox(): Promise<TargetAwaitBox> {
  return new TargetAwaitBox();
}

async function answer(): Promise<number> {
  (await makeBox()).value += await Promise.resolve(1);
  return 0;
}

answer();
