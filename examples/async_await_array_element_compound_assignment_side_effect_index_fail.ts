/// <reference lib="es2015.promise" />

class IndexState {
  items: Array<number> = [10, 20];
  index: number = 0;
  calls: number = 0;
}

function nextIndex(state: IndexState): number {
  console.log("index");
  state.calls += 1;
  return state.index;
}

function indexRhs(state: IndexState): number {
  console.log("rhs");
  state.index = 1;
  state.items[0] = 50;
  return 2;
}

async function answer(state: IndexState): Promise<number> {
  state.items[nextIndex(state)] += await Promise.resolve(indexRhs(state));
  console.log(state.items[0]);
  console.log(state.items[1]);
  console.log(state.calls);
  return state.items[0];
}

console.log("sync tail");
answer(new IndexState()).then((value: number): void => {
  console.log("then");
  console.log(value);
});
