/// <reference lib="es2015.promise" />

interface MultiAwaitSlot {
  value: number;
}

class MultiAwaitSlotBox implements MultiAwaitSlot {
  value: number = 10;
  receiverCalls: number = 0;
}

const multiSlotBox: MultiAwaitSlotBox = new MultiAwaitSlotBox();

function makeSlot(current: MultiAwaitSlotBox): MultiAwaitSlot {
  console.log("multi receiver");
  current.receiverCalls += 1;
  return current;
}

function markLeft(): number {
  console.log("multi left");
  return 1;
}

function markRight1(current: MultiAwaitSlotBox): number {
  console.log("multi right one");
  current.value = 100;
  return 2;
}

function markRight2(): number {
  console.log("multi right two");
  return 3;
}

async function answer(current: MultiAwaitSlotBox): Promise<number> {
  const result: number = await Promise.resolve(markLeft()) +
    (makeSlot(current).value += (await Promise.resolve(markRight1(current))) + (await Promise.resolve(markRight2())));
  console.log("multi expression");
  console.log(result);
  console.log(current.value);
  console.log(current.receiverCalls);
  return result;
}

console.log("sync tail");
answer(multiSlotBox).then((value: number): void => {
  console.log("multi then");
  console.log(value);
});
