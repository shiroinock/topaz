class AsyncErr {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

Promise.resolve(1).then(
  (n: number): number => n + 1,
  (e: AsyncErr): number => 0,
);
console.log("bad");
