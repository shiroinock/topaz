import { A } from "./module_cycle_a.js";

export class B {
  back: A;
  constructor(a: A) {
    this.back = a;
  }
}
