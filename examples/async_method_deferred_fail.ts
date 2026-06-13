class AsyncBox {
  saved: number = 0;
  items: Array<number> = [1, 2, 3];

  async value(): Promise<number> {
    this.items[0] += await Promise.resolve(1);
    return this.items[0];
  }
}

const box = new AsyncBox();
console.log(box.value());
