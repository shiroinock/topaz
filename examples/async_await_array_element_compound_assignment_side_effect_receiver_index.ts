/// <reference lib="es2015.promise" />

class CombinedState {
  items: Array<number> = [10, 20];
  index: number = 0;
  receiverCalls: number = 0;
  indexCalls: number = 0;
}

function makeCombinedItems(state: CombinedState): Array<number> {
  console.log("receiver");
  state.receiverCalls += 1;
  return state.items;
}

function nextCombinedIndex(state: CombinedState): number {
  console.log("index");
  state.indexCalls += 1;
  return state.index;
}

function combinedRhs(state: CombinedState): number {
  console.log("rhs");
  state.index = 1;
  state.items[0] = 50;
  return 2;
}

async function answer(state: CombinedState): Promise<number> {
  makeCombinedItems(state)[nextCombinedIndex(state)] += await Promise.resolve(combinedRhs(state));
  console.log(state.items[0]);
  console.log(state.items[1]);
  console.log(state.receiverCalls);
  console.log(state.indexCalls);
  return state.items[0];
}

console.log("sync tail");
answer(new CombinedState()).then((value: number): void => {
  console.log("then");
  console.log(value);
});
