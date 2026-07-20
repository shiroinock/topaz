/// <reference lib="es2015.promise" />

interface Slot {
  value: number;
}

class Box implements Slot {
  value: number;

  constructor(value: number) {
    this.value = value;
  }
}

class State {
  classBox: Box;
  interfaceBox: Box;
  values: Array<number>;
  classCalls: number;
  interfaceCalls: number;
  arrayCalls: number;
  indexCalls: number;

  constructor() {
    this.classBox = new Box(10);
    this.interfaceBox = new Box(20);
    this.values = [30];
    this.classCalls = 0;
    this.interfaceCalls = 0;
    this.arrayCalls = 0;
    this.indexCalls = 0;
  }
}

function mark(label: string, value: number): number {
  console.log(label);
  console.log(value);
  return value;
}

function classTarget(state: State): Box {
  console.log("class receiver");
  state.classCalls += 1;
  return state.classBox;
}

function interfaceTarget(state: State): Slot {
  console.log("interface receiver");
  state.interfaceCalls += 1;
  return state.interfaceBox;
}

function arrayTarget(state: State): Array<number> {
  console.log("array receiver");
  state.arrayCalls += 1;
  return state.values;
}

function arrayIndex(state: State): number {
  console.log("array index");
  state.indexCalls += 1;
  return 0;
}

async function answer(): Promise<number> {
  const state = new State();
  const classResult =
    await Promise.resolve(1) +
    (classTarget(state).value++) +
    await Promise.resolve(mark("right class", state.classBox.value));
  const interfaceResult =
    await Promise.resolve(4) +
    (interfaceTarget(state).value--) +
    await Promise.resolve(mark("right interface", state.interfaceBox.value));
  const arrayResult =
    await Promise.resolve(7) +
    (arrayTarget(state)[arrayIndex(state)]++) +
    await Promise.resolve(mark("right array", state.values[0]));

  console.log(classResult);
  console.log(interfaceResult);
  console.log(arrayResult);
  console.log(state.classCalls);
  console.log(state.interfaceCalls);
  console.log(state.arrayCalls);
  console.log(state.indexCalls);
  console.log(state.classBox.value);
  console.log(state.interfaceBox.value);
  console.log(state.values[0]);
  return classResult + interfaceResult + arrayResult;
}

answer().then((value: number): void => {
  console.log("then");
  console.log(value);
});

console.log("sync tail");
