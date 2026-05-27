// class と alias の名前衝突は declaration 時に reject。
class Foo {
  n: number = 0;
}

type Foo = number;

const x: Foo = 1;
console.log(x);
