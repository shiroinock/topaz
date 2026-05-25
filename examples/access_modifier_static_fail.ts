// static / abstract / override は意味が変わるので引き続き reject。
// public / private / protected / readonly のみが no-op で受理される。
class C {
  static n: number;
  constructor() {
    this.n = 1;
  }
}

console.log(new C().n);
