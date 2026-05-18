export interface Shape {
  area(): number;
}

export class Square implements Shape {
  side: number;
  constructor(s: number) {
    this.side = s;
  }
  area(): number {
    return this.side * this.side;
  }
}
