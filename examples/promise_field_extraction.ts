/// <reference lib="es2018.promise" />

type NumberPromise = Promise<number>;
type NumberLike = PromiseLike<number>;

class Box {
  current: NumberPromise;

  constructor(current: NumberPromise) {
    this.current = current;
  }

  read(): NumberPromise {
    return this.current;
  }

  replace(next: NumberPromise): void {
    this.current = next;
  }
}

interface PromiseSlot {
  current: NumberPromise;
}

class InterfaceBox implements PromiseSlot {
  current: NumberPromise;

  constructor(current: NumberPromise) {
    this.current = current;
  }
}

function readSlot(slot: PromiseSlot): NumberPromise {
  return slot.current;
}

function replaceSlot(slot: PromiseSlot, next: NumberPromise): NumberPromise {
  const before: NumberPromise = slot.current;
  slot.current = next;
  return before;
}

class LikeBox {
  current: NumberLike;

  constructor(current: NumberLike) {
    this.current = current;
  }
}

interface LikeSlot {
  current: NumberLike;
}

class LikeInterfaceBox implements LikeSlot {
  current: NumberLike;

  constructor(current: NumberLike) {
    this.current = current;
  }
}

function keepLike(value: NumberLike): NumberLike {
  return value;
}

function readLikeBox(box: LikeBox): NumberLike {
  return keepLike(box.current);
}

function readLikeSlot(slot: LikeSlot): NumberLike {
  const current: NumberLike = slot.current;
  return keepLike(current);
}

const first: NumberPromise = Promise.resolve(10);
const second: NumberPromise = Promise.resolve(20);
const third: NumberPromise = Promise.resolve(30);
const fourth: NumberPromise = Promise.resolve(40);

const box = new Box(first);
const beforeBox: NumberPromise = box.current;
beforeBox.then((value: number): void => {
  console.log("box before");
  console.log(value);
});

box.replace(second);
const afterBox: NumberPromise = box.read();
afterBox.then((value: number): void => {
  console.log("box after");
  console.log(value);
});

const impl = new InterfaceBox(third);
const slot: PromiseSlot = impl;
const beforeSlot: NumberPromise = replaceSlot(slot, fourth);
beforeSlot.then((value: number): void => {
  console.log("slot before");
  console.log(value);
});

const afterSlot: NumberPromise = readSlot(slot);
afterSlot.then((value: number): void => {
  console.log("slot after");
  console.log(value);
});

console.log("sync tail");
