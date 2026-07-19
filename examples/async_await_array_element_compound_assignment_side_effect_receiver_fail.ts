/// <reference lib="es2015.promise" />

class ReceiverState {
  items: Array<number> = [10];
  calls: number = 0;
}

function makeItems(state: ReceiverState): Array<number> {
  console.log("receiver");
  state.calls += 1;
  return state.items;
}

function receiverRhs(state: ReceiverState): number {
  console.log("rhs");
  state.items[0] = 50;
  return 2;
}

async function answer(state: ReceiverState): Promise<number> {
  makeItems(state)[0] += await Promise.resolve(receiverRhs(state));
  console.log(state.items[0]);
  console.log(state.calls);
  return state.items[0];
}

console.log("sync tail");
answer(new ReceiverState()).then((value: number): void => {
  console.log("then");
  console.log(value);
});
