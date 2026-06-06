# 0318 - generic method/interface staging

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 2.3c

## Context

[0316](./0316-post-selfhost-backlog-audit.md) split the post-selfhost backlog
and left generic method / generic interface support as a design-only phase.
The generic method probe:

```ts
class Box {
  id<T>(x: T): T { return x; }
}
let b = new Box();
console.log(b.id<number>(3));
```

currently fails as `generic method is unsupported`. The generic interface
probe:

```ts
interface Box<T> {
  value: T;
}
class NumBox implements Box<number> {
  value: number;
  constructor(value: number) { this.value = value; }
}
let b: Box<number> = new NumBox(4);
console.log(b.value);
```

currently fails in the self-host parser at `interface Box<T>` with
`expected '{'`; the tsc bridge also has an explicit
`generic interfaces are unsupported` rejection. This crosses parser, AST,
method monomorph storage, interface realization, exact structural matching,
and vtable emission, so one implementation phase would be too broad.

## Decision

Stage the work into three follow-up implementation phases. 2.3c-1 accepts
generic methods only on direct concrete class receivers, adding method-level
type parameters to class method metadata and a method monomorph worklist keyed
by receiver class, method name, receiver class type args, and method type args.
2.3c-2 adds generic interface declarations and concrete realized interface
shapes, such as `Box<number>` materializing as a mangled
`topaz_iface_Box_number`, while preserving exact structural matching after
substitution. 2.3c-3 integrates realized interface vtables, keeping the current
fat pointer representation `{ data, vt }` with one vtable shape per realized
interface.

Rejected alternatives: implementing generic methods and generic interfaces in
one phase was rejected because it crosses too many subsystems at once. Erasing
method type parameters behind interface vtables was rejected because Topaz uses
monomorphization for generic functions and classes. Keeping generic interfaces
blocked until generic classes can implement them was rejected because
non-generic classes implementing concrete generic interface instantiations are
a useful smaller step. Treating `implements I<T>` as a syntax-only string was
rejected because conformance and vtable generation need substituted realized
interface types.

## Implementation

- `MEMO.md` marks 2.3c complete and records the staged sequence.
- This ADR is design-only; no compiler, runtime, example, smoke, or package
  metadata changed.
- The next open Phase 2.3 action remains the try/finally cleanup dispatch
  design.

## Consequences

- **Accepted**: `class C { f<U>(...) { ... } }` and concrete receiver calls
  like `c.f<number>(...)` are the first implementation target.
- **Accepted**: generic interface declarations and concrete instantiations are
  handled before interface dispatch through realized vtables.
- **Rejected**: generic method support through interface dispatch is not part
  of the first direct class dispatch phase.
- **Rejected**: generic method erasure is not adopted.
- **Scope out**: generic interface methods, generic classes implementing
  interfaces, and interface dispatch of generic methods remain later design
  work.
- **Regression**: no examples or smoke cases were added because this phase is
  documentation-only and does not claim implementation support.
