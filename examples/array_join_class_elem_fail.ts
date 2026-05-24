// Phase 1.5-3.5f-join: class element rejected (format policy undefined for
// class instances). User should `.map(b => b.toString())` to string first.
class Box {
  v: number;
  constructor(v: number) {
    this.v = v;
  }
}
const bs: Array<Box> = [new Box(1), new Box(2)];
const s: string = bs.join();
console.log(s);
