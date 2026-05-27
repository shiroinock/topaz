// Phase 1.5-6 prep: method を destructure すると reject(method-as-value は
// 未対応、`.bind` も無いため)。
class Counter {
  n: number = 0;
  bump(): number {
    this.n = this.n + 1;
    return this.n;
  }
}
const c = new Counter();
const { bump } = c;
console.log(bump());
