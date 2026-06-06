function nested<T>(x: T): Array<Array<T>> {
  return [[x]];
}

function appendRow<T>(rows: Array<Array<T>>, row: Array<T>): Array<Array<T>> {
  rows.push(row);
  return rows;
}

class Cell {
  value: number;
  constructor(value: number) {
    this.value = value;
  }
  get(): number {
    return this.value;
  }
}

let matrix: Array<Array<number>> = nested(7);
console.log(matrix.length);
console.log(matrix[0][0]);

let more: Array<Array<number>> = appendRow(matrix, [8, 9]);
console.log(more.length);
console.log(more[1][1]);

let copied: Array<Array<number>> = [...more];
console.log(copied.length);
console.log(copied[0][0]);

let cells: Array<Array<Cell>> = nested<Cell>(new Cell(42));
console.log(cells.length);
console.log(cells[0][0].get());

let extra: Array<Cell> = [new Cell(100)];
cells.push(extra);
console.log(cells.length);
console.log(cells[1][0].get());
