class AsyncErr {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

const rejected: Promise<number> = Promise.reject(new AsyncErr("boom"));
rejected.catch((e: AsyncErr): number => 0);
console.log("bad");
