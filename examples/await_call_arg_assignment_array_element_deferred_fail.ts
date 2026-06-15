/// <reference lib="es2015.promise" />

function mark(label: string, value: number): number {
  console.log(label);
  return value;
}

class Store {
  values: Array<number>;
  index: number;

  constructor(values: Array<number>, index: number) {
    this.values = values;
    this.index = index;
  }
}

function replaceStore(label: string, store: Store, nextValues: Array<number>, nextIndex: number, value: number): number {
  console.log(label);
  store.values = nextValues;
  store.index = nextIndex;
  return value;
}

function combine(
  sum: number,
  right: number,
  originalFirst: number,
  originalSecond: number,
  currentFirst: number,
  currentSecond: number,
  currentIndex: number,
): number {
  console.log("combine");
  console.log(sum);
  console.log(right);
  console.log(originalFirst);
  console.log(originalSecond);
  console.log(currentFirst);
  console.log(currentSecond);
  console.log(currentIndex);
  return sum + right + originalFirst + originalSecond + currentFirst + currentSecond + currentIndex;
}

async function answer(): Promise<number> {
  const originalValues: Array<number> = [0, 0];
  const replacementValues: Array<number> = [50, 60];
  const store = new Store(originalValues, 0);
  return combine(
    await Promise.resolve(mark("left", 1)) +
      (store.values[store.index] = await Promise.resolve(replaceStore("assign", store, replacementValues, 1, 2))),
    await Promise.resolve(mark("right", 3)),
    originalValues[0],
    originalValues[1],
    store.values[0],
    store.values[1],
    store.index,
  );
}

answer().then((value: number): void => {
  console.log("then");
  console.log(value);
});

console.log("sync tail");
