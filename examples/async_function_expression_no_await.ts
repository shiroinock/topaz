/// <reference lib="es2015.promise" />

const base: number = 10;

const blockAnswer: () => Promise<number> = async function (): Promise<number> {
  console.log("function body");
  return base + 31;
};

function invoke(fn: () => Promise<number>): Promise<number> {
  return fn();
}

invoke(async function (): Promise<number> {
  return 7;
}).then((value: number): void => {
  console.log("then inline");
  console.log(value);
});

blockAnswer().then((value: number): void => {
  console.log("then block");
  console.log(value + 1);
});

console.log("sync tail");
