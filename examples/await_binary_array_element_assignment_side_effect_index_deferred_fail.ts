/// <reference lib="es2015.promise" />

class AssignedState {
  items: Array<number> = [10, 20];
  index: number = 0;
  calls: number = 0;
}

function pickIndex(state: AssignedState): number {
  console.log("index");
  state.calls += 1;
  return state.index;
}

async function left(): Promise<number> {
  console.log("left");
  return 1;
}

function rightOne(state: AssignedState): number {
  console.log("right one");
  state.index = 1;
  state.items[0] = 50;
  return 2;
}

async function rightTwo(): Promise<number> {
  console.log("right two");
  return 3;
}

async function answer(state: AssignedState): Promise<number> {
  const result = (await left()) + (state.items[pickIndex(state)] = (await Promise.resolve(rightOne(state))) + (await rightTwo()));
  console.log(result);
  console.log(state.items[0]);
  console.log(state.items[1]);
  console.log(state.calls);
  return result;
}

console.log("sync tail");
answer(new AssignedState()).then((value: number): void => {
  console.log("then");
  console.log(value);
});
