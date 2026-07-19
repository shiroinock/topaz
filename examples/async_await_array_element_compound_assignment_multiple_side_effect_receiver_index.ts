/// <reference lib="es2015.promise" />

class MultiArrayState {
  items: Array<number> = [10, 20];
  index: number = 0;
  receiverCalls: number = 0;
  indexCalls: number = 0;
}

function makeMultiItems(state: MultiArrayState): Array<number> {
  console.log("receiver");
  state.receiverCalls += 1;
  return state.items;
}

function nextMultiIndex(state: MultiArrayState): number {
  console.log("index");
  state.indexCalls += 1;
  return state.index;
}

async function multiLeft(): Promise<number> {
  console.log("left");
  return 1;
}

function multiRightOne(state: MultiArrayState): number {
  console.log("right one");
  state.index = 1;
  state.items[0] = 50;
  return 2;
}

async function multiRightTwo(): Promise<number> {
  console.log("right two");
  return 3;
}

async function answer(state: MultiArrayState): Promise<number> {
  const result = (await multiLeft()) + (makeMultiItems(state)[nextMultiIndex(state)] += (await Promise.resolve(multiRightOne(state))) + (await multiRightTwo()));
  console.log(result);
  console.log(state.items[0]);
  console.log(state.items[1]);
  console.log(state.receiverCalls);
  console.log(state.indexCalls);
  return result;
}

console.log("sync tail");
answer(new MultiArrayState()).then((value: number): void => {
  console.log("then");
  console.log(value);
});
