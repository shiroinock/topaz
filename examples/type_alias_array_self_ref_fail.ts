// Array<Foo> は body が ArrayTypeNode (中の Foo は TypeReferenceNode)。
// TypeLiteralNode が無いので pre-allocation の対象外 = generative cycle
// として resolving flag で reject。
type Foo = Array<Foo>;

const x: Foo = [];
console.log(x.length);
