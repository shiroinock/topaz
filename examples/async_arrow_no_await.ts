/// <reference lib="es2015.promise" />

const blockAnswer = async (): Promise<number> => {
  console.log("arrow body");
  return 41;
};

const exprAnswer = async (): Promise<number> => 41;

blockAnswer().then((n: number): number => {
  console.log("then block");
  console.log(n + 1);
  return n;
});

exprAnswer().then((n: number): number => {
  console.log("then expr");
  console.log(n + 1);
  return n;
});

console.log("sync tail");
