class AsyncBox {
  saved: number = 0;

  async value(): Promise<number> {
    this.saved += await Promise.resolve(1);
    return this.saved;
  }
}

const box = new AsyncBox();
console.log(box.value());
