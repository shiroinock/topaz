/// <reference lib="es2015.promise" />

const arrayItems: Array<number> = [10, 20];
let arrayIndex = 0;

const arrayLeft: () => Promise<number> = async function (): Promise<number> {
  console.log("array left");
  arrayItems[0] = 100;
  arrayIndex = 1;
  return 1;
};

const arrayRight: () => Promise<number> = async function (): Promise<number> {
  console.log("array right");
  return 2;
};

const answer: () => Promise<number> = async function (): Promise<number> {
  const result = (arrayItems[arrayIndex] += (await arrayLeft()) + (await arrayRight()));
  console.log(result);
  console.log(arrayItems[0]);
  console.log(arrayItems[1]);
  return result;
};

console.log("sync tail");
answer().then((value: number): void => {
  console.log("array then");
  console.log(value);
});
