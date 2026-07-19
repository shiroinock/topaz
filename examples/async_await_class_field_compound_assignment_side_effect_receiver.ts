/// <reference lib="es2015.promise" />

class SideEffectReceiverBox {
  value: number = 10;
  receiverCalls: number = 0;
}

const box: SideEffectReceiverBox = new SideEffectReceiverBox();

function makeBox(current: SideEffectReceiverBox): SideEffectReceiverBox {
  console.log("class receiver");
  current.receiverCalls += 1;
  return current;
}

function makeRhs(current: SideEffectReceiverBox): number {
  console.log("class rhs");
  current.value = 100;
  return 2;
}

async function answer(current: SideEffectReceiverBox): Promise<number> {
  makeBox(current).value += await Promise.resolve(makeRhs(current));
  console.log("class assigned");
  console.log(current.value);
  console.log(current.receiverCalls);
  return current.value;
}

console.log("sync tail");
answer(box).then((value: number): void => {
  console.log("class then");
  console.log(value);
});
