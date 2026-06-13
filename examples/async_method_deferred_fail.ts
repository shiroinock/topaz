class AsyncBox {
  async value(): Promise<number> {
    return 1;
  }
}

const box = new AsyncBox();
console.log(box.value());
