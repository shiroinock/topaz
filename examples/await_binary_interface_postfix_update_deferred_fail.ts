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

async function answer(): Promise<number> {
  const incrementSlot: Slot = new Box(1);
  const decrementSlot: Slot = new Box(5);

  const normalIncrement = incrementSlot.value++;
  const normalDecrement = decrementSlot.value--;
  console.log(normalIncrement);
  console.log(incrementSlot.value);
  console.log(normalDecrement);
  console.log(decrementSlot.value);

  const total =
    await Promise.resolve(100) +
    (incrementSlot.value++) +
    (decrementSlot.value--) +
    await Promise.resolve(1000);
  console.log(incrementSlot.value);
  console.log(decrementSlot.value);
  return total;
}

answer().then((value: number): void => {
  console.log(value);
});
