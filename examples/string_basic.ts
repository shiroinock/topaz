function greet(name: string): string {
  return "hello, " + name + "!";
}

let msg: string = greet("topaz");
console.log(msg);
console.log(msg.length);

let s: string = "abc";
s += "def";
console.log(s);
console.log(s === "abcdef");
console.log(s !== "abc");

let kind: string = "dog";
switch (kind) {
  case "cat":
    console.log("meow");
    break;
  case "dog":
    console.log("woof");
    break;
  default:
    console.log("?");
    break;
}
