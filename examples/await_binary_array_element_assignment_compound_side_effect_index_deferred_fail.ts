/// <reference lib="es2015.promise" />

class CompoundState {
  items: Array<number> = [10, 20];
  index: number = 0;
  calls: number = 0;
}

function pickCompoundIndex(state: CompoundState): number {
  console.log("index");
  state.calls += 1;
  return state.index;
}

async function compoundLeft(): Promise<number> {
  console.log("left");
  return 1;
}

function compoundRightOne(state: CompoundState): number {
  console.log("right one");
  state.index = 1;
  state.items[0] = 50;
  return 2;
}

async function compoundRightTwo(): Promise<number> {
  console.log("right two");
  return 3;
}

async function answer(state: CompoundState): Promise<number> {
  const result = (await compoundLeft()) + (state.items[pickCompoundIndex(state)] += (await Promise.resolve(compoundRightOne(state))) + (await compoundRightTwo()));
  console.log(result);
  console.log(state.items[0]);
  console.log(state.items[1]);
  console.log(state.calls);
  return result;
}

console.log("sync tail");
answer(new CompoundState()).then((value: number): void => {
  console.log("then");
  console.log(value);
});
