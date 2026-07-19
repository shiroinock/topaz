/// <reference lib="es2015.promise" />

interface SideEffectSlot {
  value: number;
}

class SideEffectSlotBox implements SideEffectSlot {
  value: number = 20;
  receiverCalls: number = 0;
}

const slotBox: SideEffectSlotBox = new SideEffectSlotBox();

function makeSlot(current: SideEffectSlotBox): SideEffectSlot {
  console.log("interface receiver");
  current.receiverCalls += 1;
  return current;
}

function makeSlotRhs(current: SideEffectSlotBox): number {
  console.log("interface rhs");
  current.value = 200;
  return 3;
}

async function answer(current: SideEffectSlotBox): Promise<number> {
  makeSlot(current).value += await Promise.resolve(makeSlotRhs(current));
  console.log("interface assigned");
  console.log(current.value);
  console.log(current.receiverCalls);
  return current.value;
}

console.log("sync tail");
answer(slotBox).then((value: number): void => {
  console.log("interface then");
  console.log(value);
});
