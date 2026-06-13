class AsyncErr {
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

const value = Promise.reject(new AsyncErr("missing context"));
console.log("bad");
