class AsyncErr {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

const value: Promise<void> = Promise.reject(new AsyncErr("one"), new AsyncErr("two"));
console.log("bad");
