import * as ts from "typescript";

// Phase 1.4c-3: TopazType is a structured tagged-union. Until 1.4c-2 we used a
// string-union ("topaz_array_class_Box" etc.) keyed by canonical C identifier,
// which broke on nested containers (`Array<Array<T>>`) and would have made
// generic class monomorph plumbing painful. Helpers below preserve the same
// C identifier surface (typeIdent / cTypeName / arrayShortName / ...) so the
// generated C is byte-identical to the pre-refactor output.
type TopazType =
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "string" }
  | { kind: "array"; elem: TopazType }
  | { kind: "map"; key: TopazType; value: TopazType }
  | { kind: "set"; elem: TopazType }
  | { kind: "class"; name: string }
  | { kind: "iface"; name: string };

const T_NUMBER: TopazType = { kind: "number" };
const T_BOOLEAN: TopazType = { kind: "boolean" };
const T_STRING: TopazType = { kind: "string" };

const TOPAZ_THIS = "__topaz_this";

function isScalarType(t: TopazType): boolean {
  return t.kind === "number" || t.kind === "boolean" || t.kind === "string";
}

function isArrayType(t: TopazType): boolean { return t.kind === "array"; }
function isMapType(t: TopazType): boolean { return t.kind === "map"; }
function isSetType(t: TopazType): boolean { return t.kind === "set"; }
function isClassType(t: TopazType): boolean { return t.kind === "class"; }
function isInterfaceType(t: TopazType): boolean { return t.kind === "iface"; }

function classNameOf(t: TopazType): string | undefined {
  return t.kind === "class" ? t.name : undefined;
}

function classOf(name: string): TopazType {
  return { kind: "class", name };
}

function interfaceNameOf(t: TopazType): string | undefined {
  return t.kind === "iface" ? t.name : undefined;
}

function interfaceOf(name: string): TopazType {
  return { kind: "iface", name };
}

// "reference" here means represented in C as `T *` (pointer). Interfaces are
// fat-pointer structs passed by value, so they're handled separately by
// cTypeName even though their semantics (shared underlying data) are
// reference-like.
function isReferenceType(t: TopazType): boolean {
  return isArrayType(t) || isMapType(t) || isSetType(t) || isClassType(t);
}

function arrayElem(t: TopazType): TopazType | undefined {
  return t.kind === "array" ? t.elem : undefined;
}

function arrayOf(elem: TopazType): TopazType | undefined {
  if (!isScalarType(elem) && !isClassType(elem) && !isInterfaceType(elem)) return undefined;
  return { kind: "array", elem };
}

function mapKey(t: TopazType): TopazType | undefined {
  return t.kind === "map" ? t.key : undefined;
}

function mapValue(t: TopazType): TopazType | undefined {
  return t.kind === "map" ? t.value : undefined;
}

function mapOf(k: TopazType, v: TopazType): TopazType | undefined {
  if (!isScalarType(k)) return undefined;
  if (!isScalarType(v) && !isClassType(v) && !isInterfaceType(v)) return undefined;
  return { kind: "map", key: k, value: v };
}

function setElem(t: TopazType): TopazType | undefined {
  return t.kind === "set" ? t.elem : undefined;
}

function setOf(elem: TopazType): TopazType | undefined {
  if (!isScalarType(elem) && !isClassType(elem) && !isInterfaceType(elem)) return undefined;
  return { kind: "set", elem };
}

// Structural equality. Replaces the old string `===` comparisons; do not use
// `===` directly on TopazType (objects compare by reference).
function typeEq(a: TopazType, b: TopazType): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "number":
    case "boolean":
    case "string":
      return true;
    case "array":
      return typeEq(a.elem, (b as Extract<TopazType, { kind: "array" }>).elem);
    case "map": {
      const bm = b as Extract<TopazType, { kind: "map" }>;
      return typeEq(a.key, bm.key) && typeEq(a.value, bm.value);
    }
    case "set":
      return typeEq(a.elem, (b as Extract<TopazType, { kind: "set" }>).elem);
    case "class":
      return a.name === (b as Extract<TopazType, { kind: "class" }>).name;
    case "iface":
      return a.name === (b as Extract<TopazType, { kind: "iface" }>).name;
  }
}

// Element/value "tag" used to compose C identifiers (the bit after
// `topaz_array_`, `topaz_set_`, the value half of `topaz_map_<K>_<V>`). For
// scalars it's the bare name; for class/iface it carries the `class_`/`iface_`
// prefix so we never collide with scalars or with each other.
function elemTag(t: TopazType): string {
  switch (t.kind) {
    case "number":
    case "boolean":
    case "string":
      return t.kind;
    case "class":
      return `class_${t.name}`;
    case "iface":
      return `iface_${t.name}`;
    default:
      throw new Error(`elemTag: container element kind=${t.kind} is unsupported (no nested containers yet)`);
  }
}

function scalarTag(t: TopazType): string {
  if (t.kind !== "number" && t.kind !== "boolean" && t.kind !== "string") {
    throw new Error(`scalarTag: expected scalar, got kind=${t.kind}`);
  }
  return t.kind;
}

// Monomorph short-name tags (used to compose function/struct names like
// `topaz_array_<short>_push`). Each matches the substring after the container
// prefix from the pre-1.4c-3 string union.
function arrayShortName(t: TopazType): string {
  if (t.kind !== "array") throw new Error(`arrayShortName: not an array, kind=${t.kind}`);
  return elemTag(t.elem);
}

function mapShortName(t: TopazType): string {
  if (t.kind !== "map") throw new Error(`mapShortName: not a map, kind=${t.kind}`);
  return `${scalarTag(t.key)}_${elemTag(t.value)}`;
}

function setShortName(t: TopazType): string {
  if (t.kind !== "set") throw new Error(`setShortName: not a set, kind=${t.kind}`);
  return elemTag(t.elem);
}

// Canonical C identifier for a type — the same string the pre-1.4c-3 string
// union used as its value. Used both as the C type name (for non-reference
// types) and as the display form in error messages and Map/Set keys.
function typeIdent(t: TopazType): string {
  switch (t.kind) {
    case "number":
    case "boolean":
    case "string":
      return `topaz_${t.kind}`;
    case "array":
      return `topaz_array_${arrayShortName(t)}`;
    case "map":
      return `topaz_map_${mapShortName(t)}`;
    case "set":
      return `topaz_set_${setShortName(t)}`;
    case "class":
      return `topaz_class_${t.name}`;
    case "iface":
      return `topaz_iface_${t.name}`;
  }
}

// Stable key for using TopazType as a Map/Set key. Identical to typeIdent.
function typeKey(t: TopazType): string {
  return typeIdent(t);
}

// C type used in declarations and signatures. Reference types (Array/Map/Set
// /Class) are pointers so assignment shares storage. Interfaces are passed by
// value as fat pointer structs (struct topaz_iface_X with embedded data ptr).
function cTypeName(t: TopazType): string {
  if (isInterfaceType(t)) return typeIdent(t);
  return isReferenceType(t) ? `${typeIdent(t)} *` : typeIdent(t);
}

type Binding = { type: TopazType; isConst: boolean };

class CodegenError extends Error {
  constructor(node: ts.Node, message: string) {
    const sf = node.getSourceFile();
    if (sf) {
      const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      super(`${sf.fileName}:${line + 1}:${character + 1}: ${message}`);
    } else {
      super(message);
    }
  }
}

function unsupported(node: ts.Node, what: string): never {
  throw new CodegenError(node, `unsupported ${what} (${ts.SyntaxKind[node.kind]})`);
}

class Scope {
  private stack: Map<string, Binding>[] = [new Map()];

  push(): void {
    this.stack.push(new Map());
  }

  pop(): void {
    this.stack.pop();
  }

  declare(name: string, type: TopazType, isConst: boolean, node: ts.Node): void {
    const top = this.stack[this.stack.length - 1]!;
    if (top.has(name)) {
      throw new CodegenError(node, `redeclaration of '${name}'`);
    }
    top.set(name, { type, isConst });
  }

  lookup(name: string): Binding | undefined {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const b = this.stack[i]!.get(name);
      if (b) return b;
    }
    return undefined;
  }
}

type ParamInfo = { name: string; type: TopazType };

type MethodInfo = {
  params: ParamInfo[];
  returnType: TopazType;
  decl: ts.MethodDeclaration;
};

type ClassInfo = {
  name: string;
  fields: Map<string, TopazType>;
  fieldOrder: string[];
  ctor: { params: ParamInfo[]; decl: ts.ConstructorDeclaration } | undefined;
  methods: Map<string, MethodInfo>;
  implements: string[]; // interface names this class declares to implement
  decl: ts.ClassDeclaration;
};

type InterfaceMethodSig = {
  params: ParamInfo[];
  returnType: TopazType;
  decl: ts.MethodSignature;
};

type InterfaceInfo = {
  name: string;
  fields: Map<string, TopazType>;
  fieldOrder: string[];
  methods: Map<string, InterfaceMethodSig>;
  methodOrder: string[];
  decl: ts.InterfaceDeclaration;
};

type FunctionSig = { params: ParamInfo[]; returnType: TopazType };

// Phase 1.4c-2: generic top-level functions. Type parameters live in the AST
// only; we don't resolve param/return types until a call site supplies concrete
// type arguments (explicit or inferred). One MonomorphInfo per realized
// (function, typeArgs) tuple.
type GenericFunctionInfo = {
  name: string;
  typeParams: string[];
  decl: ts.FunctionDeclaration;
};

type MonomorphInfo = {
  mangled: string;
  origName: string;
  typeArgs: TopazType[];
  subs: Map<string, TopazType>;
  sig: FunctionSig;
  decl: ts.FunctionDeclaration;
};

// Phase 1.4c-3: generic top-level classes. Same shape as GenericFunctionInfo
// but for classes. Concrete monomorphs land in `this.classes` under the
// mangled name; the original `name` (e.g. "Box") is reserved in
// `genericClasses` so `new Box<...>` / `Box<T>` references can be resolved.
type GenericClassInfo = {
  name: string;
  typeParams: string[];
  decl: ts.ClassDeclaration;
};

// Per realized (class, typeArgs) tuple. The ClassInfo under the mangled name
// in `this.classes` already carries the substituted fields/methods (so
// references to `T` in collected types are already concrete), but the method
// *bodies* still mention `T`, so we need `subs` again when emitting them.
type ClassMonomorphInfo = {
  mangled: string;
  origName: string;
  typeArgs: TopazType[];
  subs: Map<string, TopazType>;
};

// Mangling: stripped of the `topaz_` prefix, joined with `__`. Class/iface
// names already carry a `class_` / `iface_` prefix, so the resulting C
// identifier is unambiguous (e.g. `identity__number`, `pair__class_Box`,
// `first__array_class_Box`).
function mangleTypeArg(t: TopazType): string {
  return typeIdent(t).slice("topaz_".length);
}

function mangleMonomorph(origName: string, args: readonly TopazType[]): string {
  return `${origName}__${args.map(mangleTypeArg).join("__")}`;
}

class Emitter {
  private scope = new Scope();
  private functionSigs = new Map<string, FunctionSig>();
  private classes = new Map<string, ClassInfo>();
  private interfaces = new Map<string, InterfaceInfo>();
  private currentClass: string | undefined;
  private currentReturnType: TopazType | undefined;
  private switchCounter = 0;
  private tmpCounter = 0;
  // Phase 1.4c-1a: each Array<class>/Array<interface> referenced in user code
  // gets a TOPAZ_ARRAY_DEFINE() expansion in the generated C, since the runtime
  // header only preexpands the scalar monomorphs. Keyed by typeKey() so we
  // de-duplicate structurally (TopazType objects compare by reference).
  private arrayMonomorphs = new Map<string, TopazType>();
  // Phase 1.4c-1b: same idea for Map<K, class|interface> and Set<class|interface>.
  // Maps are tracked by full (K, V) tuple so we get one expansion per combo.
  private mapMonomorphs = new Map<string, TopazType>();
  private setMonomorphs = new Map<string, TopazType>();
  // Phase 1.4c-2: generic function declarations (registered but not signed
  // until a call site supplies type arguments), realized monomorphs keyed by
  // mangled name, and a worklist for monomorphs whose body still needs to be
  // emitted. typeParamScope binds the active substitution while emitting a
  // monomorph body (or while resolving its signature).
  private genericFunctions = new Map<string, GenericFunctionInfo>();
  private genericMonomorphs = new Map<string, MonomorphInfo>();
  private genericWorklist: string[] = [];
  private typeParamScope: Map<string, TopazType> | undefined;
  // Phase 1.4c-3: generic class declarations and their realized monomorphs.
  // The mangled name (e.g. "Box__number") is the key into `this.classes` for
  // the substituted ClassInfo; the worklist accumulates monomorphs whose
  // typedef/struct/methods still need to be emitted in the late slots.
  private genericClasses = new Map<string, GenericClassInfo>();
  private classMonomorphs = new Map<string, ClassMonomorphInfo>();
  private classMonomorphWorklist: string[] = [];

  private recordArrayMonomorph(t: TopazType): void {
    if (!isArrayType(t)) return;
    if (isScalarType(arrayElem(t)!)) return; // runtime.h preexpands these
    this.arrayMonomorphs.set(typeKey(t), t);
  }

  private recordMapMonomorph(t: TopazType): void {
    if (!isMapType(t)) return;
    if (isScalarType(mapValue(t)!)) return; // runtime.h preexpands scalar K×V combos
    this.mapMonomorphs.set(typeKey(t), t);
  }

  private recordSetMonomorph(t: TopazType): void {
    if (!isSetType(t)) return;
    if (isScalarType(setElem(t)!)) return; // runtime.h preexpands scalar element sets
    this.setMonomorphs.set(typeKey(t), t);
  }

  emit(sf: ts.SourceFile): string {
    const functions: ts.FunctionDeclaration[] = [];
    const classes: ts.ClassDeclaration[] = [];
    const interfaces: ts.InterfaceDeclaration[] = [];
    const topLevel: ts.Statement[] = [];
    for (const stmt of sf.statements) {
      if (ts.isFunctionDeclaration(stmt)) functions.push(stmt);
      else if (ts.isClassDeclaration(stmt)) classes.push(stmt);
      else if (ts.isInterfaceDeclaration(stmt)) interfaces.push(stmt);
      else topLevel.push(stmt);
    }

    // Pass 1a: register class names so field/method types can refer to each
    // other regardless of source order. Generic classes (`class Box<T>`) are
    // held aside in `genericClasses`; their substituted ClassInfo is built
    // lazily under the mangled name on first use.
    for (const cls of classes) {
      if (!cls.name) throw new CodegenError(cls, "class must be named");
      const name = cls.name.text;
      if (name === "Array" || name === "Map" || name === "Set") {
        throw new CodegenError(cls, `cannot redefine built-in '${name}'`);
      }
      if (this.classes.has(name) || this.genericClasses.has(name)) {
        throw new CodegenError(cls, `redeclaration of class '${name}'`);
      }
      if (cls.typeParameters && cls.typeParameters.length > 0) {
        // Validate the type-param declaration eagerly so errors fire even
        // when the class is never instantiated (mirrors generic functions).
        const typeParams: string[] = [];
        for (const tp of cls.typeParameters) {
          if (tp.constraint) {
            throw new CodegenError(tp, "type parameter constraints are unsupported (Phase 1.4c-3)");
          }
          if (tp.default) {
            throw new CodegenError(tp, "default type parameters are unsupported (Phase 1.4c-3)");
          }
          if (typeParams.includes(tp.name.text)) {
            throw new CodegenError(tp, `duplicate type parameter '${tp.name.text}'`);
          }
          typeParams.push(tp.name.text);
        }
        if (cls.heritageClauses && cls.heritageClauses.length > 0) {
          throw new CodegenError(
            cls,
            "generic classes cannot implement interfaces (Phase 1.4c-3)",
          );
        }
        this.genericClasses.set(name, { name, typeParams, decl: cls });
        continue;
      }
      this.classes.set(name, {
        name,
        fields: new Map(),
        fieldOrder: [],
        ctor: undefined,
        methods: new Map(),
        implements: [],
        decl: cls,
      });
    }

    // Pass 1b: register interface names.
    for (const iface of interfaces) {
      const name = iface.name.text;
      if (name === "Array" || name === "Map" || name === "Set") {
        throw new CodegenError(iface, `cannot redefine built-in '${name}'`);
      }
      if (this.classes.has(name) || this.genericClasses.has(name)) {
        throw new CodegenError(iface, `interface '${name}' collides with a class of the same name`);
      }
      if (this.interfaces.has(name)) {
        throw new CodegenError(iface, `redeclaration of interface '${name}'`);
      }
      this.interfaces.set(name, {
        name,
        fields: new Map(),
        fieldOrder: [],
        methods: new Map(),
        methodOrder: [],
        decl: iface,
      });
    }

    // Pass 2a: parse interface members (so classes can reference interfaces in
    // field/method types).
    for (const iface of interfaces) {
      this.collectInterfaceMembers(iface);
    }

    // Pass 2b: parse class members + verify implements. Generic classes are
    // deferred — their substituted ClassInfo is built on demand when a use
    // site instantiates them via instantiateGenericClass.
    for (const cls of classes) {
      if (cls.typeParameters && cls.typeParameters.length > 0) continue;
      this.collectClassMembers(cls);
    }

    for (const fn of functions) {
      if (!fn.name) throw new CodegenError(fn, "function must be named");
      const fname = fn.name.text;
      if (this.functionSigs.has(fname) || this.genericFunctions.has(fname)) {
        throw new CodegenError(fn, `redeclaration of function '${fname}'`);
      }
      if (fn.typeParameters && fn.typeParameters.length > 0) {
        // Generic function: defer signature resolution until call sites
        // supply concrete type arguments. We still validate the type-param
        // declaration here so the error fires regardless of whether the
        // function is ever called.
        const typeParams: string[] = [];
        for (const tp of fn.typeParameters) {
          if (tp.constraint) {
            throw new CodegenError(tp, "type parameter constraints are unsupported (Phase 1.4c-2)");
          }
          if (tp.default) {
            throw new CodegenError(tp, "default type parameters are unsupported (Phase 1.4c-2)");
          }
          if (typeParams.includes(tp.name.text)) {
            throw new CodegenError(tp, `duplicate type parameter '${tp.name.text}'`);
          }
          typeParams.push(tp.name.text);
        }
        this.genericFunctions.set(fname, { name: fname, typeParams, decl: fn });
        continue;
      }
      const ret = this.typeFromAnnotation(fn.type, fn);
      const params = this.collectParams(fn.parameters);
      this.functionSigs.set(fname, { params, returnType: ret });
    }

    const out: string[] = [];
    out.push('#include "runtime.h"');
    out.push("");

    // Forward-declare class structs and interface vtable structs so any
    // ordering of fields/methods that crosses class/interface boundaries works.
    // Generic class monomorphs get their own typedef slot below; we don't
    // know all of them yet.
    const concreteClasses = classes.filter(
      (c) => !(c.typeParameters && c.typeParameters.length > 0),
    );
    if (concreteClasses.length > 0) {
      for (const cls of concreteClasses) {
        const n = cls.name!.text;
        out.push(`typedef struct topaz_class_${n} topaz_class_${n};`);
      }
      out.push("");
    }
    // Phase 1.4c-3: generic class monomorph typedefs. Concrete class struct
    // bodies, function signatures, and main() can all reference monomorph
    // class pointers, so the typedef must precede everything below. Filled
    // at the end of emit() once the class worklist has drained.
    const classMonoTypedefSlot = out.length;
    out.push("");
    if (interfaces.length > 0) {
      for (const iface of interfaces) {
        const n = iface.name.text;
        out.push(`struct topaz_iface_${n}_vt;`);
        out.push(
          `typedef struct topaz_iface_${n} { void *data; const struct topaz_iface_${n}_vt *vt; } topaz_iface_${n};`,
        );
      }
      out.push("");
    }
    if (concreteClasses.length > 0) {
      for (const cls of concreteClasses) {
        out.push(this.emitClassStruct(this.classes.get(cls.name!.text)!));
      }
      out.push("");
    }
    // Phase 1.4c-3: generic class monomorph struct definitions. Field types
    // already use pointer C types for class refs, so this can sit after
    // concrete struct defs without circular-ordering pain.
    const classMonoStructSlot = out.length;
    out.push("");
    if (interfaces.length > 0) {
      for (const iface of interfaces) {
        out.push(this.emitInterfaceVtableStruct(this.interfaces.get(iface.name.text)!));
      }
      out.push("");
    }

    // Placeholder for TOPAZ_ARRAY_DEFINE / TOPAZ_MAP_DEFINE / TOPAZ_SET_DEFINE
    // expansions for container monomorphs whose element/value type is a class
    // or interface. We don't know the full set until we've walked every
    // expression, so splice the real entries in at the very end.
    const containerMonomorphSlot = out.length;
    out.push("");

    for (const fn of functions) {
      if (fn.typeParameters && fn.typeParameters.length > 0) continue;
      out.push(`${this.formatSignature(fn)};`);
    }
    for (const cls of concreteClasses) {
      const info = this.classes.get(cls.name!.text)!;
      for (const line of this.classMemberSignatures(info)) out.push(`${line};`);
    }
    if (functions.length > 0 || concreteClasses.length > 0) out.push("");

    // Phase 1.4c-3: forward declarations for generic class monomorph members.
    // Placed alongside the concrete class member fwds so user code, methods,
    // and main() can all reference monomorph constructors/methods by mangled
    // name. Filled at the end of emit().
    const classMonoSigSlot = out.length;
    out.push("");

    // Phase 1.4c-2: forward declarations for generic-function monomorphs go
    // here so concrete function bodies, class methods, and main() can all
    // reference them by mangled name. Filled at the end of emit() once the
    // worklist has fully drained.
    const monomorphFwdSlot = out.length;
    out.push("");

    // Emit per-(interface, implementing-class) wrapper functions and the
    // static const vtable instances. These must come before user function /
    // class method definitions so coercion sites (`&topaz_iface_I_for_C_vt`)
    // can reference them.
    for (const cls of concreteClasses) {
      const info = this.classes.get(cls.name!.text)!;
      for (const ifaceName of info.implements) {
        const iface = this.interfaces.get(ifaceName)!;
        for (const def of this.emitInterfaceWrappers(iface, info)) {
          out.push(def);
        }
        out.push(this.emitInterfaceVtableInstance(iface, info));
        out.push("");
      }
    }

    for (const fn of functions) {
      if (fn.typeParameters && fn.typeParameters.length > 0) continue;
      out.push(this.emitFunctionDefinition(fn));
      out.push("");
    }

    for (const cls of concreteClasses) {
      const info = this.classes.get(cls.name!.text)!;
      for (const def of this.emitClassMemberDefinitions(info)) {
        out.push(def);
        out.push("");
      }
    }

    // Phase 1.4c-3: generic class monomorph member definitions. Filled at
    // the end of emit() after the class worklist drains. Sits before the
    // generic function monomorph defs since a generic class method body
    // might call a generic function with a monomorph class type arg.
    const classMonoDefSlot = out.length;
    out.push("");

    // Phase 1.4c-2: monomorph definitions land just before main, after any
    // concrete user functions/methods. They're already forward-declared above
    // so the order between concrete and monomorph defs doesn't matter.
    const monomorphDefSlot = out.length;
    out.push("");

    out.push("int main(void) {");
    this.scope.push();
    for (const stmt of topLevel) {
      out.push(this.emitStatement(stmt, 1));
    }
    this.scope.pop();
    out.push("  return 0;");
    out.push("}");

    // Drain the generic worklists now that all user emission is done. Class
    // and function monomorphs can transitively register each other (a
    // generic class method may call a generic function and vice versa), so
    // we round-robin until both worklists are empty. Container monomorphs
    // discovered here flow into the arrayMonomorphs/mapMonomorphs/
    // setMonomorphs sets and get expanded below.
    const classMonoTypedefLines: string[] = [];
    const classMonoStructLines: string[] = [];
    const classMonoSigLines: string[] = [];
    const classMonoDefLines: string[] = [];
    const monoFwdLines: string[] = [];
    const monoDefLines: string[] = [];
    while (
      this.classMonomorphWorklist.length > 0 ||
      this.genericWorklist.length > 0
    ) {
      while (this.classMonomorphWorklist.length > 0) {
        const mangled = this.classMonomorphWorklist.shift()!;
        const info = this.classes.get(mangled)!;
        const mono = this.classMonomorphs.get(mangled)!;
        classMonoTypedefLines.push(`typedef struct topaz_class_${mangled} topaz_class_${mangled};`);
        classMonoStructLines.push(this.emitClassStruct(info));
        for (const line of this.classMemberSignatures(info)) classMonoSigLines.push(`${line};`);
        // Method bodies still reference T/U/...; reactivate the substitution
        // for the duration of body emission.
        const prevScope = this.typeParamScope;
        this.typeParamScope = mono.subs;
        try {
          for (const def of this.emitClassMemberDefinitions(info)) {
            classMonoDefLines.push(def);
            classMonoDefLines.push("");
          }
        } finally {
          this.typeParamScope = prevScope;
        }
      }
      while (this.genericWorklist.length > 0) {
        const mangled = this.genericWorklist.shift()!;
        const mono = this.genericMonomorphs.get(mangled)!;
        monoFwdLines.push(`${this.formatMonomorphSignature(mono.mangled, mono.sig)};`);
        monoDefLines.push(this.emitMonomorphDefinition(mono));
        monoDefLines.push("");
      }
    }
    if (classMonoTypedefLines.length > 0) {
      out[classMonoTypedefSlot] = classMonoTypedefLines.join("\n") + "\n";
    }
    if (classMonoStructLines.length > 0) {
      out[classMonoStructSlot] = classMonoStructLines.join("\n") + "\n";
    }
    if (classMonoSigLines.length > 0) {
      out[classMonoSigSlot] = classMonoSigLines.join("\n") + "\n";
    }
    if (classMonoDefLines.length > 0) {
      // Generic class methods can legitimately ignore type-parameterized
      // params just like generic functions, and a monomorph realized via a
      // type annotation may have methods that are never called (e.g.
      // `Box<string>.replace` when only `.get` is used). Suppress both
      // warnings around the monomorph block.
      out[classMonoDefSlot] = [
        '#pragma GCC diagnostic push',
        '#pragma GCC diagnostic ignored "-Wunused-parameter"',
        '#pragma GCC diagnostic ignored "-Wunused-function"',
        classMonoDefLines.join("\n"),
        '#pragma GCC diagnostic pop',
      ].join("\n");
    }
    if (monoFwdLines.length > 0) {
      out[monomorphFwdSlot] = monoFwdLines.join("\n") + "\n";
    }
    if (monoDefLines.length > 0) {
      // Generic functions can legitimately ignore some type-parameterized
      // params in the body (e.g. `pickSecond<A,B>(a: A, b: B): B` only uses
      // `b`), which trips -Wunused-parameter. Wrap the monomorph block in a
      // diagnostic pragma rather than synthesizing a `(void)x` per param.
      const wrapped = [
        '#pragma GCC diagnostic push',
        '#pragma GCC diagnostic ignored "-Wunused-parameter"',
        monoDefLines.join("\n"),
        '#pragma GCC diagnostic pop',
      ].join("\n");
      out[monomorphDefSlot] = wrapped;
    }

    if (
      this.arrayMonomorphs.size > 0 ||
      this.mapMonomorphs.size > 0 ||
      this.setMonomorphs.size > 0
    ) {
      const sections: string[] = [];
      // Set<class>/Set<interface> need a typed hash/eq pair before
      // TOPAZ_SET_DEFINE can reference them; emit those first.
      const setElemKeys = new Set<string>();
      const helperLines: string[] = [];
      for (const t of this.setMonomorphs.values()) {
        const elem = setElem(t)!;
        const key = typeKey(elem);
        if (setElemKeys.has(key)) continue;
        setElemKeys.add(key);
        helperLines.push(...this.emitSetElemHelpers(elem));
      }
      if (helperLines.length > 0) sections.push(helperLines.join("\n"));

      for (const t of this.arrayMonomorphs.values()) {
        sections.push(this.emitArrayMonomorphMacro(t));
      }
      for (const t of this.mapMonomorphs.values()) {
        sections.push(this.emitMapMonomorphMacro(t));
      }
      for (const t of this.setMonomorphs.values()) {
        sections.push(this.emitSetMonomorphMacro(t));
      }

      // TOPAZ_ARRAY_DEFINE / TOPAZ_MAP_DEFINE / TOPAZ_SET_DEFINE expand several
      // static-inline helpers (notably _pop / _delete) that the user program
      // may not call. Suppress the warning so emit stays monomorph-driven
      // instead of usage-driven.
      out[containerMonomorphSlot] =
        `#pragma GCC diagnostic push\n` +
        `#pragma GCC diagnostic ignored "-Wunused-function"\n` +
        `${sections.join("\n")}\n` +
        `#pragma GCC diagnostic pop\n`;
    }

    return out.join("\n") + "\n";
  }

  // Phase 1.4c-1a: expand TOPAZ_ARRAY_DEFINE for class/interface element types.
  // Scalar monomorphs (number/boolean/string) are pre-expanded in runtime.h.
  private emitArrayMonomorphMacro(t: TopazType): string {
    const tag = arrayShortName(t);
    const elem = arrayElem(t)!;
    let cElem: string;
    if (isClassType(elem)) {
      cElem = `topaz_class_${classNameOf(elem)!} *`;
    } else if (isInterfaceType(elem)) {
      cElem = `topaz_iface_${interfaceNameOf(elem)!}`;
    } else {
      throw new Error(`unexpected array element type ${typeIdent(elem)} for monomorph emission`);
    }
    return `TOPAZ_ARRAY_DEFINE(${tag}, ${cElem})`;
  }

  // Phase 1.4c-1b: expand TOPAZ_MAP_DEFINE for scalar-keyed maps whose value
  // type is a class or interface. The key still uses the scalar hash/eq from
  // runtime.h; only the value type changes.
  private emitMapMonomorphMacro(t: TopazType): string {
    const tag = mapShortName(t);
    const k = mapKey(t)!;
    const v = mapValue(t)!;
    const kShort = scalarTag(k);
    const hashFn = `topaz_hash_${kShort}`;
    // string keys use topaz_string_eq (byte compare); number/boolean use the
    // SameValueZero-aware topaz_key_eq_* wrappers from runtime.h.
    const eqFn = kShort === "string" ? "topaz_string_eq" : `topaz_key_eq_${kShort}`;
    const cVal = this.cElemTypeForContainer(v);
    return `TOPAZ_MAP_DEFINE(${tag}, ${typeIdent(k)}, ${cVal}, ${hashFn}, ${eqFn})`;
  }

  // Phase 1.4c-1b: expand TOPAZ_SET_DEFINE for class/interface element sets.
  // The hash/eq wrappers were emitted earlier (see emitSetElemHelpers).
  private emitSetMonomorphMacro(t: TopazType): string {
    const tag = setShortName(t);
    const elem = setElem(t)!;
    const cElem = this.cElemTypeForContainer(elem);
    let hashFn: string;
    let eqFn: string;
    if (isClassType(elem)) {
      const cname = classNameOf(elem)!;
      hashFn = `topaz_hash_class_${cname}`;
      eqFn = `topaz_key_eq_class_${cname}`;
    } else if (isInterfaceType(elem)) {
      const iname = interfaceNameOf(elem)!;
      hashFn = `topaz_hash_iface_${iname}`;
      eqFn = `topaz_key_eq_iface_${iname}`;
    } else {
      throw new Error(`unexpected set element type ${typeIdent(elem)} for monomorph emission`);
    }
    return `TOPAZ_SET_DEFINE(${tag}, ${cElem}, ${hashFn}, ${eqFn})`;
  }

  // Per-(class|interface) hash and key-equality wrappers used by
  // Set<class>/Set<interface> monomorphs. JS Set uses reference identity for
  // objects, so the hash routes the underlying pointer through
  // topaz_hash_pointer and equality is pointer comparison. For interface
  // elements that's the .data field of the fat pointer — two interface values
  // wrapping the same instance compare equal regardless of which interface
  // "view" they came from.
  private emitSetElemHelpers(elem: TopazType): string[] {
    if (isClassType(elem)) {
      const cname = classNameOf(elem)!;
      const cType = `topaz_class_${cname} *`;
      return [
        `static inline size_t topaz_hash_class_${cname}(${cType} p) { return topaz_hash_pointer((const void *)p); }`,
        `static inline topaz_boolean topaz_key_eq_class_${cname}(${cType} a, ${cType} b) { return a == b; }`,
      ];
    }
    if (isInterfaceType(elem)) {
      const iname = interfaceNameOf(elem)!;
      const iType = `topaz_iface_${iname}`;
      return [
        `static inline size_t topaz_hash_iface_${iname}(${iType} v) { return topaz_hash_pointer(v.data); }`,
        `static inline topaz_boolean topaz_key_eq_iface_${iname}(${iType} a, ${iType} b) { return a.data == b.data; }`,
      ];
    }
    throw new Error(`unexpected set element type ${typeIdent(elem)} for helper emission`);
  }

  private cElemTypeForContainer(elem: TopazType): string {
    if (isClassType(elem)) return `topaz_class_${classNameOf(elem)!} *`;
    if (isInterfaceType(elem)) return `topaz_iface_${interfaceNameOf(elem)!}`;
    if (isScalarType(elem)) return typeIdent(elem);
    throw new Error(`unexpected container element type ${typeIdent(elem)}`);
  }

  private collectInterfaceMembers(iface: ts.InterfaceDeclaration): void {
    const info = this.interfaces.get(iface.name.text)!;
    if (iface.typeParameters && iface.typeParameters.length > 0) {
      throw new CodegenError(iface, "generic interfaces are unsupported (Phase 1.4c)");
    }
    if (iface.heritageClauses && iface.heritageClauses.length > 0) {
      throw new CodegenError(iface, "interface inheritance (`extends`) is unsupported");
    }
    if (iface.modifiers && iface.modifiers.length > 0) {
      throw new CodegenError(iface, "interface modifiers (export/default) are unsupported");
    }
    for (const m of iface.members) {
      if (ts.isPropertySignature(m)) {
        if (!m.name || !ts.isIdentifier(m.name)) {
          throw new CodegenError(m, "interface field name must be a simple identifier");
        }
        if (m.questionToken) {
          throw new CodegenError(m, "optional interface fields are unsupported");
        }
        if (m.modifiers && m.modifiers.length > 0) {
          throw new CodegenError(m, "interface field modifiers (readonly) are unsupported");
        }
        const fname = m.name.text;
        if (info.fields.has(fname) || info.methods.has(fname)) {
          throw new CodegenError(m, `duplicate member '${fname}' in interface '${info.name}'`);
        }
        const t = this.typeFromAnnotation(m.type, m);
        info.fields.set(fname, t);
        info.fieldOrder.push(fname);
      } else if (ts.isMethodSignature(m)) {
        if (!m.name || !ts.isIdentifier(m.name)) {
          throw new CodegenError(m, "interface method name must be a simple identifier");
        }
        if (m.questionToken) {
          throw new CodegenError(m, "optional interface methods are unsupported");
        }
        if (m.typeParameters && m.typeParameters.length > 0) {
          throw new CodegenError(m, "generic interface methods are unsupported (Phase 1.4c)");
        }
        const mname = m.name.text;
        if (info.fields.has(mname) || info.methods.has(mname)) {
          throw new CodegenError(m, `duplicate member '${mname}' in interface '${info.name}'`);
        }
        const params = this.collectParams(m.parameters);
        const returnType = this.typeFromAnnotation(m.type, m);
        info.methods.set(mname, { params, returnType, decl: m });
        info.methodOrder.push(mname);
      } else if (ts.isIndexSignatureDeclaration(m)) {
        throw new CodegenError(m, "interface index signatures are unsupported");
      } else if (ts.isCallSignatureDeclaration(m) || ts.isConstructSignatureDeclaration(m)) {
        throw new CodegenError(m, "interface call/construct signatures are unsupported");
      } else if (ts.isGetAccessor(m) || ts.isSetAccessor(m)) {
        throw new CodegenError(m, "interface accessors are unsupported");
      } else {
        unsupported(m, "interface member");
      }
    }
  }

  private collectClassMembers(cls: ts.ClassDeclaration, infoOverride?: ClassInfo): void {
    // infoOverride is set when collecting members for a generic class
    // monomorph (the ClassInfo lives under the mangled name, not cls.name);
    // otherwise we look up by the source name.
    const info = infoOverride ?? this.classes.get(cls.name!.text)!;
    if (cls.heritageClauses) {
      for (const hc of cls.heritageClauses) {
        if (hc.token === ts.SyntaxKind.ExtendsKeyword) {
          throw new CodegenError(hc, "`extends` is unsupported (no class inheritance)");
        }
        if (hc.token !== ts.SyntaxKind.ImplementsKeyword) {
          throw new CodegenError(hc, "unsupported heritage clause");
        }
        for (const t of hc.types) {
          if (!ts.isIdentifier(t.expression)) {
            throw new CodegenError(t, "implements target must be a bare interface name");
          }
          if (t.typeArguments && t.typeArguments.length > 0) {
            throw new CodegenError(t, "generic interfaces are unsupported (Phase 1.4c)");
          }
          const ifaceName = t.expression.text;
          if (!this.interfaces.has(ifaceName)) {
            throw new CodegenError(t, `unknown interface '${ifaceName}'`);
          }
          if (info.implements.includes(ifaceName)) {
            throw new CodegenError(t, `class '${info.name}' lists interface '${ifaceName}' more than once`);
          }
          info.implements.push(ifaceName);
        }
      }
    }
    if (cls.modifiers && cls.modifiers.length > 0) {
      throw new CodegenError(cls, "class modifiers (export/default/abstract) are unsupported");
    }
    for (const m of cls.members) {
      if (m.kind === ts.SyntaxKind.SemicolonClassElement) continue;
      if ((ts as any).canHaveModifiers?.(m) && ts.getModifiers && ts.getModifiers(m as any)) {
        const mods = ts.getModifiers(m as any);
        if (mods && mods.length > 0) {
          throw new CodegenError(m, "member modifiers (static/public/private/protected/readonly/abstract/override) are unsupported");
        }
      }
      if (ts.isPropertyDeclaration(m)) {
        this.collectField(info, m);
      } else if (ts.isConstructorDeclaration(m)) {
        this.collectConstructor(info, m);
      } else if (ts.isMethodDeclaration(m)) {
        this.collectMethod(info, m);
      } else if (ts.isGetAccessorDeclaration(m) || ts.isSetAccessorDeclaration(m)) {
        throw new CodegenError(m, "get/set accessors are unsupported");
      } else if (ts.isClassStaticBlockDeclaration(m)) {
        throw new CodegenError(m, "static blocks are unsupported");
      } else {
        unsupported(m, "class member");
      }
    }
    if (info.fields.size > 0 && !info.ctor) {
      throw new CodegenError(
        cls,
        `class '${info.name}' has fields but no constructor; add an explicit constructor`,
      );
    }
    for (const ifaceName of info.implements) {
      this.verifyImplements(info, this.interfaces.get(ifaceName)!, cls);
    }
  }

  // Phase 1.4b: exact structural match — interface field types and method
  // signatures must equal the class's. No coercion happens at the vtable
  // boundary, only at user-visible value sites.
  private verifyImplements(cls: ClassInfo, iface: InterfaceInfo, anchor: ts.Node): void {
    for (const fname of iface.fieldOrder) {
      const want = iface.fields.get(fname)!;
      const got = cls.fields.get(fname);
      if (!got) {
        throw new CodegenError(
          anchor,
          `class '${cls.name}' is missing field '${fname}' required by interface '${iface.name}'`,
        );
      }
      if (!typeEq(got, want)) {
        throw new CodegenError(
          anchor,
          `class '${cls.name}.${fname}' has type ${typeIdent(got)}, but interface '${iface.name}' requires ${typeIdent(want)}`,
        );
      }
    }
    for (const mname of iface.methodOrder) {
      const want = iface.methods.get(mname)!;
      const got = cls.methods.get(mname);
      if (!got) {
        throw new CodegenError(
          anchor,
          `class '${cls.name}' is missing method '${mname}' required by interface '${iface.name}'`,
        );
      }
      if (!typeEq(got.returnType, want.returnType)) {
        throw new CodegenError(
          anchor,
          `class '${cls.name}.${mname}' returns ${typeIdent(got.returnType)}, but interface '${iface.name}' requires ${typeIdent(want.returnType)}`,
        );
      }
      if (got.params.length !== want.params.length) {
        throw new CodegenError(
          anchor,
          `class '${cls.name}.${mname}' has ${got.params.length} parameter(s), but interface '${iface.name}' requires ${want.params.length}`,
        );
      }
      for (let i = 0; i < want.params.length; i++) {
        if (!typeEq(got.params[i]!.type, want.params[i]!.type)) {
          throw new CodegenError(
            anchor,
            `class '${cls.name}.${mname}' parameter ${i + 1} has type ${typeIdent(got.params[i]!.type)}, but interface '${iface.name}' requires ${typeIdent(want.params[i]!.type)}`,
          );
        }
      }
    }
  }

  private classImplements(className: string, ifaceName: string): boolean {
    const cls = this.classes.get(className);
    if (!cls) return false;
    return cls.implements.includes(ifaceName);
  }

  private collectField(info: ClassInfo, m: ts.PropertyDeclaration): void {
    if (!ts.isIdentifier(m.name)) {
      throw new CodegenError(m, "field name must be a simple identifier");
    }
    const fname = m.name.text;
    if (info.fields.has(fname)) {
      throw new CodegenError(m, `redeclaration of field '${fname}'`);
    }
    if (info.methods.has(fname)) {
      throw new CodegenError(m, `field '${fname}' conflicts with a method of the same name`);
    }
    if (m.questionToken) {
      throw new CodegenError(m, "optional fields are unsupported");
    }
    if (m.exclamationToken) {
      throw new CodegenError(m, "definite-assignment assertion `!` is unsupported");
    }
    if (m.initializer) {
      throw new CodegenError(m, "field initializers are unsupported; assign in the constructor");
    }
    const t = this.typeFromAnnotation(m.type, m);
    info.fields.set(fname, t);
    info.fieldOrder.push(fname);
  }

  private collectConstructor(info: ClassInfo, m: ts.ConstructorDeclaration): void {
    if (info.ctor) {
      throw new CodegenError(m, `class '${info.name}' has multiple constructors`);
    }
    if (m.typeParameters && m.typeParameters.length > 0) {
      throw new CodegenError(m, "generic constructors are unsupported");
    }
    if (!m.body) throw new CodegenError(m, "constructor must have a body");
    const params = this.collectParams(m.parameters);
    info.ctor = { params, decl: m };
  }

  private collectMethod(info: ClassInfo, m: ts.MethodDeclaration): void {
    if (!ts.isIdentifier(m.name)) {
      throw new CodegenError(m, "method name must be a simple identifier");
    }
    const mname = m.name.text;
    if (info.methods.has(mname)) {
      throw new CodegenError(m, `redeclaration of method '${mname}'`);
    }
    if (info.fields.has(mname)) {
      throw new CodegenError(m, `method '${mname}' conflicts with a field of the same name`);
    }
    if (m.typeParameters && m.typeParameters.length > 0) {
      throw new CodegenError(m, "generic methods are unsupported (Phase 1.4c)");
    }
    if (m.questionToken) {
      throw new CodegenError(m, "optional methods are unsupported");
    }
    if (m.asteriskToken) {
      throw new CodegenError(m, "generator methods are unsupported");
    }
    if (!m.body) throw new CodegenError(m, "method must have a body");
    const params = this.collectParams(m.parameters);
    const returnType = this.typeFromAnnotation(m.type, m);
    info.methods.set(mname, { params, returnType, decl: m });
  }

  private collectParams(parameters: ts.NodeArray<ts.ParameterDeclaration>): ParamInfo[] {
    const out: ParamInfo[] = [];
    for (const p of parameters) {
      if (!ts.isIdentifier(p.name)) {
        throw new CodegenError(p, "parameter must be a simple identifier");
      }
      if (p.questionToken || p.initializer || p.dotDotDotToken) {
        throw new CodegenError(p, "optional/default/rest parameters are unsupported");
      }
      if (p.modifiers && p.modifiers.length > 0) {
        throw new CodegenError(p, "parameter property shorthand is unsupported; declare the field explicitly");
      }
      const t = this.typeFromAnnotation(p.type, p);
      out.push({ name: p.name.text, type: t });
    }
    return out;
  }

  private emitClassStruct(info: ClassInfo): string {
    const lines: string[] = [];
    lines.push(`struct topaz_class_${info.name} {`);
    if (info.fieldOrder.length === 0) {
      // Empty struct (no fields). C requires at least one member in a struct,
      // and zero-field classes are corner cases (tag types). Add a dummy.
      lines.push("  char __topaz_empty;");
    } else {
      for (const f of info.fieldOrder) {
        const t = info.fields.get(f)!;
        lines.push(`  ${cTypeName(t)} ${f};`);
      }
    }
    lines.push("};");
    return lines.join("\n");
  }

  private classMemberSignatures(info: ClassInfo): string[] {
    const lines: string[] = [];
    if (info.ctor) {
      lines.push(this.constructorSignature(info));
    }
    for (const [, method] of info.methods) {
      lines.push(this.methodSignature(info, method));
    }
    return lines;
  }

  private emitClassMemberDefinitions(info: ClassInfo): string[] {
    const out: string[] = [];
    if (info.ctor) out.push(this.emitConstructorDefinition(info));
    for (const [, method] of info.methods) {
      out.push(this.emitMethodDefinition(info, method));
    }
    return out;
  }

  private constructorSignature(info: ClassInfo): string {
    const params = info.ctor!.params
      .map((p) => `${cTypeName(p.type)} ${p.name}`)
      .join(", ");
    return `static topaz_class_${info.name} *topaz_class_${info.name}_new(${params || "void"})`;
  }

  private methodSignature(info: ClassInfo, method: MethodInfo): string {
    const name = (method.decl.name as ts.Identifier).text;
    const ownerArg = `topaz_class_${info.name} *${TOPAZ_THIS}`;
    const tail = method.params.map((p) => `${cTypeName(p.type)} ${p.name}`).join(", ");
    const params = tail ? `${ownerArg}, ${tail}` : ownerArg;
    return `static ${cTypeName(method.returnType)} topaz_class_${info.name}_method_${name}(${params})`;
  }

  private emitConstructorDefinition(info: ClassInfo): string {
    const ctor = info.ctor!;
    this.currentClass = info.name;
    this.scope.push();
    try {
      for (const p of ctor.params) {
        this.scope.declare(p.name, p.type, /* isConst */ false, ctor.decl);
      }
      const bodyLines: string[] = [];
      bodyLines.push("{");
      bodyLines.push(
        `  topaz_class_${info.name} *${TOPAZ_THIS} = (topaz_class_${info.name} *)calloc(1, sizeof(*${TOPAZ_THIS}));`,
      );
      bodyLines.push(`  if (!${TOPAZ_THIS}) { fputs("topaz: out of memory\\n", stderr); abort(); }`);
      for (const s of ctor.decl.body!.statements) {
        if (ts.isReturnStatement(s)) {
          throw new CodegenError(s, "`return` inside a constructor is unsupported");
        }
        bodyLines.push(this.emitStatement(s, 1));
      }
      bodyLines.push(`  return ${TOPAZ_THIS};`);
      bodyLines.push("}");
      return `${this.constructorSignature(info)} ${bodyLines.join("\n")}`;
    } finally {
      this.scope.pop();
      this.currentClass = undefined;
    }
  }

  private emitMethodDefinition(info: ClassInfo, method: MethodInfo): string {
    this.currentClass = info.name;
    const prevRet = this.currentReturnType;
    this.currentReturnType = method.returnType;
    this.scope.push();
    try {
      for (const p of method.params) {
        this.scope.declare(p.name, p.type, /* isConst */ false, method.decl);
      }
      const body = this.emitBlock(method.decl.body!, 0);
      return `${this.methodSignature(info, method)} ${body}`;
    } finally {
      this.scope.pop();
      this.currentClass = undefined;
      this.currentReturnType = prevRet;
    }
  }

  // Phase 1.4b: each interface gets a vtable struct. Fields become get/set
  // function pointers (so we don't have to pin field layouts across all
  // implementing classes), methods become function pointers that take
  // `void *self` as the first arg.
  private emitInterfaceVtableStruct(info: InterfaceInfo): string {
    const lines: string[] = [];
    lines.push(`struct topaz_iface_${info.name}_vt {`);
    if (info.fieldOrder.length === 0 && info.methodOrder.length === 0) {
      lines.push("  char __topaz_empty;");
    } else {
      for (const f of info.fieldOrder) {
        const t = info.fields.get(f)!;
        lines.push(`  ${cTypeName(t)} (*get_${f})(void *self);`);
        lines.push(`  void (*set_${f})(void *self, ${cTypeName(t)} value);`);
      }
      for (const mname of info.methodOrder) {
        const sig = info.methods.get(mname)!;
        const tail = sig.params.map((p) => `${cTypeName(p.type)} ${p.name}`).join(", ");
        const params = tail ? `void *self, ${tail}` : "void *self";
        lines.push(`  ${cTypeName(sig.returnType)} (*${mname})(${params});`);
      }
    }
    lines.push("};");
    return lines.join("\n");
  }

  // Per-(interface, implementing-class) thin wrappers around the class's
  // field accesses and methods. Each one casts `void *self` back to
  // `topaz_class_<C> *` and forwards to the underlying access/call.
  private emitInterfaceWrappers(iface: InterfaceInfo, cls: ClassInfo): string[] {
    const out: string[] = [];
    const prefix = `topaz_iface_${iface.name}_for_${cls.name}`;
    for (const f of iface.fieldOrder) {
      const t = iface.fields.get(f)!;
      out.push(
        `static ${cTypeName(t)} ${prefix}_get_${f}(void *self) { return ((topaz_class_${cls.name} *)self)->${f}; }`,
      );
      out.push(
        `static void ${prefix}_set_${f}(void *self, ${cTypeName(t)} value) { ((topaz_class_${cls.name} *)self)->${f} = value; }`,
      );
    }
    for (const mname of iface.methodOrder) {
      const sig = iface.methods.get(mname)!;
      const declParams =
        sig.params.length === 0
          ? "void *self"
          : `void *self, ${sig.params.map((p) => `${cTypeName(p.type)} ${p.name}`).join(", ")}`;
      const callArgs = [`(topaz_class_${cls.name} *)self`, ...sig.params.map((p) => p.name)].join(", ");
      out.push(
        `static ${cTypeName(sig.returnType)} ${prefix}_${mname}(${declParams}) { return topaz_class_${cls.name}_method_${mname}(${callArgs}); }`,
      );
    }
    return out;
  }

  private emitInterfaceVtableInstance(iface: InterfaceInfo, cls: ClassInfo): string {
    const prefix = `topaz_iface_${iface.name}_for_${cls.name}`;
    const entries: string[] = [];
    for (const f of iface.fieldOrder) {
      entries.push(`  .get_${f} = ${prefix}_get_${f},`);
      entries.push(`  .set_${f} = ${prefix}_set_${f},`);
    }
    for (const mname of iface.methodOrder) {
      entries.push(`  .${mname} = ${prefix}_${mname},`);
    }
    const body = entries.length === 0 ? "  .__topaz_empty = 0,\n" : entries.join("\n") + "\n";
    return `static const struct topaz_iface_${iface.name}_vt ${prefix}_vt = {\n${body}};`;
  }

  private typeFromAnnotation(node: ts.TypeNode | undefined, anchor: ts.Node): TopazType {
    if (!node) throw new CodegenError(anchor, "type annotation required");
    if (node.kind === ts.SyntaxKind.NumberKeyword) return T_NUMBER;
    if (node.kind === ts.SyntaxKind.BooleanKeyword) return T_BOOLEAN;
    if (node.kind === ts.SyntaxKind.StringKeyword) return T_STRING;
    if (ts.isArrayTypeNode(node)) {
      const elem = this.typeFromAnnotation(node.elementType, node);
      const arr = arrayOf(elem);
      if (!arr) {
        throw new CodegenError(node, `no Array monomorph for element type ${typeIdent(elem)}`);
      }
      this.recordArrayMonomorph(arr);
      return arr;
    }
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
      const refName = node.typeName.text;
      // Phase 1.4c-2: when emitting under an active type-parameter scope,
      // bare type references like `T` resolve through the substitution. Must
      // come before the class/interface lookup so that a class declared with
      // the same name as a type parameter doesn't shadow the binding.
      if (this.typeParamScope && this.typeParamScope.has(refName)) {
        if (node.typeArguments && node.typeArguments.length > 0) {
          throw new CodegenError(node, `type parameter '${refName}' cannot have type arguments`);
        }
        return this.typeParamScope.get(refName)!;
      }
      if (refName === "Array") {
        if (!node.typeArguments || node.typeArguments.length !== 1) {
          throw new CodegenError(node, "Array<T> requires exactly one type argument");
        }
        const elem = this.typeFromAnnotation(node.typeArguments[0]!, node);
        const arr = arrayOf(elem);
        if (!arr) {
          throw new CodegenError(node, `no Array monomorph for element type ${typeIdent(elem)}`);
        }
        this.recordArrayMonomorph(arr);
        return arr;
      }
      if (refName === "Map") {
        if (!node.typeArguments || node.typeArguments.length !== 2) {
          throw new CodegenError(node, "Map<K, V> requires exactly two type arguments");
        }
        const k = this.typeFromAnnotation(node.typeArguments[0]!, node);
        const v = this.typeFromAnnotation(node.typeArguments[1]!, node);
        const m = mapOf(k, v);
        if (!m) {
          throw new CodegenError(node, `no Map monomorph for key=${typeIdent(k)}, value=${typeIdent(v)}`);
        }
        this.recordMapMonomorph(m);
        return m;
      }
      if (refName === "Set") {
        if (!node.typeArguments || node.typeArguments.length !== 1) {
          throw new CodegenError(node, "Set<T> requires exactly one type argument");
        }
        const elem = this.typeFromAnnotation(node.typeArguments[0]!, node);
        const s = setOf(elem);
        if (!s) {
          throw new CodegenError(node, `no Set monomorph for element type ${typeIdent(elem)}`);
        }
        this.recordSetMonomorph(s);
        return s;
      }
      if (this.genericClasses.has(refName)) {
        return this.instantiateGenericClass(refName, node.typeArguments, node);
      }
      if (this.classes.has(refName)) {
        if (node.typeArguments && node.typeArguments.length > 0) {
          throw new CodegenError(node, `class '${refName}' takes no type arguments`);
        }
        return classOf(refName);
      }
      if (this.interfaces.has(refName)) {
        if (node.typeArguments && node.typeArguments.length > 0) {
          throw new CodegenError(node, `interface '${refName}' takes no type arguments (Phase 1.4c)`);
        }
        return interfaceOf(refName);
      }
    }
    unsupported(node, "type");
  }

  private formatSignature(fn: ts.FunctionDeclaration): string {
    const ret = this.typeFromAnnotation(fn.type, fn);
    const params = fn.parameters
      .map((p) => {
        if (!ts.isIdentifier(p.name)) {
          throw new CodegenError(p, "parameter must be a simple identifier");
        }
        if (p.questionToken || p.initializer || p.dotDotDotToken) {
          throw new CodegenError(p, "optional/default/rest parameters are unsupported");
        }
        const t = this.typeFromAnnotation(p.type, p);
        return `${cTypeName(t)} ${p.name.text}`;
      })
      .join(", ");
    return `static ${cTypeName(ret)} ${fn.name!.text}(${params || "void"})`;
  }

  private emitFunctionDefinition(fn: ts.FunctionDeclaration): string {
    if (!fn.body) throw new CodegenError(fn, "function must have a body");
    const sig = this.functionSigs.get(fn.name!.text)!;
    const prevRet = this.currentReturnType;
    this.currentReturnType = sig.returnType;
    this.scope.push();
    try {
      for (const p of fn.parameters) {
        const name = (p.name as ts.Identifier).text;
        const t = this.typeFromAnnotation(p.type, p);
        this.scope.declare(name, t, /* isConst */ false, p);
      }
      const body = this.emitBlock(fn.body, 0);
      return `${this.formatSignature(fn)} ${body}`;
    } finally {
      this.scope.pop();
      this.currentReturnType = prevRet;
    }
  }

  // Phase 1.4c-2: format a monomorph's C signature from its resolved
  // FunctionSig. Distinct from formatSignature(fn) which re-resolves via
  // typeFromAnnotation; here the substitution has already been applied and we
  // want the mangled name instead of the source name.
  private formatMonomorphSignature(mangled: string, sig: FunctionSig): string {
    const params = sig.params
      .map((p) => `${cTypeName(p.type)} ${p.name}`)
      .join(", ");
    return `static ${cTypeName(sig.returnType)} ${mangled}(${params || "void"})`;
  }

  private emitMonomorphDefinition(mono: MonomorphInfo): string {
    if (!mono.decl.body) throw new CodegenError(mono.decl, "function must have a body");
    const prevScope = this.typeParamScope;
    this.typeParamScope = mono.subs;
    const prevRet = this.currentReturnType;
    this.currentReturnType = mono.sig.returnType;
    this.scope.push();
    try {
      for (const p of mono.sig.params) {
        this.scope.declare(p.name, p.type, /* isConst */ false, mono.decl);
      }
      const body = this.emitBlock(mono.decl.body, 0);
      return `${this.formatMonomorphSignature(mono.mangled, mono.sig)} ${body}`;
    } finally {
      this.scope.pop();
      this.currentReturnType = prevRet;
      this.typeParamScope = prevScope;
    }
  }

  // Phase 1.4c-2: resolve a call to a generic function. Returns the mangled
  // name and the substituted FunctionSig; registers the monomorph (and adds
  // it to the worklist) on first observation. Returns undefined if `callee`
  // doesn't name a generic function — caller falls back to concrete dispatch.
  private resolveGenericCall(
    callee: ts.Identifier,
    expr: ts.CallExpression,
  ): { mangled: string; sig: FunctionSig } | undefined {
    const generic = this.genericFunctions.get(callee.text);
    if (!generic) return undefined;

    const subs = new Map<string, TopazType>();

    if (expr.typeArguments && expr.typeArguments.length > 0) {
      if (expr.typeArguments.length !== generic.typeParams.length) {
        throw new CodegenError(
          expr,
          `${callee.text} expects ${generic.typeParams.length} type argument(s), got ${expr.typeArguments.length}`,
        );
      }
      for (let i = 0; i < generic.typeParams.length; i++) {
        // Type arguments can themselves reference the surrounding scope's
        // type parameters (when a generic body calls another generic), so
        // typeFromAnnotation must run with the outer typeParamScope still
        // active. We don't swap it here.
        const t = this.typeFromAnnotation(expr.typeArguments[i]!, expr);
        subs.set(generic.typeParams[i]!, t);
      }
    } else {
      // Best-effort inference: walk each parameter type node against the
      // corresponding argument's inferred type, binding type parameters as
      // we go. Concrete portions don't contribute. After the walk, every
      // declared type parameter must be bound.
      if (expr.arguments.length !== generic.decl.parameters.length) {
        throw new CodegenError(
          expr,
          `${callee.text}() expects ${generic.decl.parameters.length} argument(s), got ${expr.arguments.length}`,
        );
      }
      for (let i = 0; i < generic.decl.parameters.length; i++) {
        const param = generic.decl.parameters[i]!;
        if (!param.type) {
          throw new CodegenError(param, "generic function parameter requires a type annotation");
        }
        const argType = this.inferType(expr.arguments[i]!);
        this.unifyTypeParam(param.type, argType, generic.typeParams, subs, expr);
      }
      for (const tp of generic.typeParams) {
        if (!subs.has(tp)) {
          throw new CodegenError(
            expr,
            `cannot infer type parameter '${tp}' for ${callee.text}; provide explicit type arguments`,
          );
        }
      }
    }

    const typeArgs = generic.typeParams.map((tp) => subs.get(tp)!);
    const mangled = mangleMonomorph(generic.name, typeArgs);

    const existing = this.genericMonomorphs.get(mangled);
    if (existing) {
      return { mangled, sig: existing.sig };
    }

    // First time we've seen this (function, typeArgs) tuple — resolve the
    // signature under the new substitution and queue body emission.
    const prevScope = this.typeParamScope;
    this.typeParamScope = subs;
    let sig: FunctionSig;
    try {
      const returnType = this.typeFromAnnotation(generic.decl.type, generic.decl);
      const params = this.collectParams(generic.decl.parameters);
      sig = { params, returnType };
    } finally {
      this.typeParamScope = prevScope;
    }

    const mono: MonomorphInfo = {
      mangled,
      origName: generic.name,
      typeArgs,
      subs,
      sig,
      decl: generic.decl,
    };
    this.genericMonomorphs.set(mangled, mono);
    this.genericWorklist.push(mangled);
    return { mangled, sig };
  }

  // Phase 1.4c-3: realize `Box<number>`-style references. The mangled name
  // (e.g. "Box__number") is registered in `this.classes` with substituted
  // fields/methods; future references see the cache and return immediately.
  // Throws if `refName` isn't a generic class (callers gate on
  // `this.genericClasses.has(refName)` before invoking).
  private instantiateGenericClass(
    refName: string,
    typeArgNodes: readonly ts.TypeNode[] | undefined,
    anchor: ts.Node,
  ): TopazType {
    const generic = this.genericClasses.get(refName)!;
    if (!typeArgNodes || typeArgNodes.length !== generic.typeParams.length) {
      throw new CodegenError(
        anchor,
        `${refName} expects ${generic.typeParams.length} type argument(s), got ${typeArgNodes?.length ?? 0}`,
      );
    }
    // Type args can themselves reference the surrounding type-param scope
    // (e.g. a generic class field of type `Box<T>`), so resolve under the
    // current scope without swapping.
    const subs = new Map<string, TopazType>();
    for (let i = 0; i < generic.typeParams.length; i++) {
      const t = this.typeFromAnnotation(typeArgNodes[i]!, anchor);
      subs.set(generic.typeParams[i]!, t);
    }
    const typeArgs = generic.typeParams.map((tp) => subs.get(tp)!);
    const mangled = mangleMonomorph(generic.name, typeArgs);
    if (this.classMonomorphs.has(mangled)) {
      return classOf(mangled);
    }
    // Pre-register the ClassInfo so a recursive reference (e.g.
    // `class Node<T> { next: Node<T>; }` instantiated as `Node<number>`)
    // sees the in-progress entry instead of recursing forever.
    const info: ClassInfo = {
      name: mangled,
      fields: new Map(),
      fieldOrder: [],
      ctor: undefined,
      methods: new Map(),
      implements: [],
      decl: generic.decl,
    };
    this.classes.set(mangled, info);
    this.classMonomorphs.set(mangled, { mangled, origName: generic.name, typeArgs, subs });
    this.classMonomorphWorklist.push(mangled);
    // Collect fields/methods under the substitution. typeParamScope is the
    // same channel generic functions use; typeFromAnnotation already
    // consults it before falling through to class/interface lookups.
    const prevScope = this.typeParamScope;
    this.typeParamScope = subs;
    try {
      this.collectClassMembers(generic.decl, info);
    } finally {
      this.typeParamScope = prevScope;
    }
    return classOf(mangled);
  }

  // Structural unifier: matches a parameter's TypeNode against an argument's
  // concrete TopazType, binding type parameters where it can. Anything it
  // can't decompose (mismatched shapes, type forms we don't introspect) is
  // silently skipped — the caller checks at the end that every parameter was
  // bound, and the per-argument coercion at emitCall surfaces any real
  // mismatches with a type-error message.
  private unifyTypeParam(
    paramTypeNode: ts.TypeNode,
    argType: TopazType,
    params: string[],
    subs: Map<string, TopazType>,
    anchor: ts.Node,
  ): void {
    if (ts.isParenthesizedTypeNode(paramTypeNode)) {
      this.unifyTypeParam(paramTypeNode.type, argType, params, subs, anchor);
      return;
    }
    if (ts.isArrayTypeNode(paramTypeNode)) {
      if (!isArrayType(argType)) return;
      const elem = arrayElem(argType);
      if (elem === undefined) return;
      this.unifyTypeParam(paramTypeNode.elementType, elem, params, subs, anchor);
      return;
    }
    if (ts.isTypeReferenceNode(paramTypeNode) && ts.isIdentifier(paramTypeNode.typeName)) {
      const refName = paramTypeNode.typeName.text;
      if (params.includes(refName)) {
        if (paramTypeNode.typeArguments && paramTypeNode.typeArguments.length > 0) {
          throw new CodegenError(
            paramTypeNode,
            `type parameter '${refName}' cannot have type arguments`,
          );
        }
        const existing = subs.get(refName);
        if (existing !== undefined && !typeEq(existing, argType)) {
          throw new CodegenError(
            anchor,
            `type parameter '${refName}' inferred as both ${typeIdent(existing)} and ${typeIdent(argType)}`,
          );
        }
        subs.set(refName, argType);
        return;
      }
      if (
        refName === "Array" &&
        paramTypeNode.typeArguments &&
        paramTypeNode.typeArguments.length === 1
      ) {
        if (!isArrayType(argType)) return;
        const elem = arrayElem(argType);
        if (elem === undefined) return;
        this.unifyTypeParam(paramTypeNode.typeArguments[0]!, elem, params, subs, anchor);
        return;
      }
      if (
        refName === "Map" &&
        paramTypeNode.typeArguments &&
        paramTypeNode.typeArguments.length === 2
      ) {
        if (!isMapType(argType)) return;
        const k = mapKey(argType);
        const v = mapValue(argType);
        if (k === undefined || v === undefined) return;
        this.unifyTypeParam(paramTypeNode.typeArguments[0]!, k, params, subs, anchor);
        this.unifyTypeParam(paramTypeNode.typeArguments[1]!, v, params, subs, anchor);
        return;
      }
      if (
        refName === "Set" &&
        paramTypeNode.typeArguments &&
        paramTypeNode.typeArguments.length === 1
      ) {
        if (!isSetType(argType)) return;
        const elem = setElem(argType);
        if (elem === undefined) return;
        this.unifyTypeParam(paramTypeNode.typeArguments[0]!, elem, params, subs, anchor);
        return;
      }
      // Phase 1.4c-3: generic class on the parameter side. The argument's
      // TopazType is a regular class type whose name is the mangled monomorph;
      // we recover the original generic + per-position type args from
      // `classMonomorphs` and unify pairwise.
      if (
        this.genericClasses.has(refName) &&
        paramTypeNode.typeArguments &&
        paramTypeNode.typeArguments.length > 0
      ) {
        if (!isClassType(argType)) return;
        const argClassName = classNameOf(argType)!;
        const argMono = this.classMonomorphs.get(argClassName);
        if (!argMono || argMono.origName !== refName) return;
        if (argMono.typeArgs.length !== paramTypeNode.typeArguments.length) return;
        for (let i = 0; i < paramTypeNode.typeArguments.length; i++) {
          this.unifyTypeParam(
            paramTypeNode.typeArguments[i]!,
            argMono.typeArgs[i]!,
            params,
            subs,
            anchor,
          );
        }
        return;
      }
      // Concrete class/interface/scalar reference — nothing to bind.
    }
  }

  private emitBlock(block: ts.Block, indent: number): string {
    const pad = "  ".repeat(indent);
    const lines = block.statements.map((s) => this.emitStatement(s, indent + 1));
    return `${pad}{\n${lines.join("\n")}\n${pad}}`;
  }

  private emitStatement(stmt: ts.Statement, indent: number): string {
    const pad = "  ".repeat(indent);

    if (ts.isReturnStatement(stmt)) {
      if (!stmt.expression) return `${pad}return;`;
      if (!this.currentReturnType) {
        throw new CodegenError(stmt, "`return` outside of a function or method");
      }
      return `${pad}return ${this.emitWithExpected(stmt.expression, this.currentReturnType)};`;
    }

    if (ts.isExpressionStatement(stmt)) {
      return `${pad}${this.emitExpression(stmt.expression)};`;
    }

    if (ts.isVariableStatement(stmt)) {
      return this.emitVarDecls(stmt.declarationList, indent);
    }

    if (ts.isIfStatement(stmt)) {
      this.expectType(stmt.expression, T_BOOLEAN);
      const cond = this.emitExpression(stmt.expression);
      const thenStr = this.emitStatementAsBlock(stmt.thenStatement, indent);
      let out = `${pad}if (${cond}) ${thenStr.trimStart()}`;
      if (stmt.elseStatement) {
        const elseStr = this.emitStatementAsBlock(stmt.elseStatement, indent);
        out += ` else ${elseStr.trimStart()}`;
      }
      return out;
    }

    if (ts.isWhileStatement(stmt)) {
      this.expectType(stmt.expression, T_BOOLEAN);
      const cond = this.emitExpression(stmt.expression);
      const body = this.emitStatementAsBlock(stmt.statement, indent);
      return `${pad}while (${cond}) ${body.trimStart()}`;
    }

    if (ts.isDoStatement(stmt)) {
      this.expectType(stmt.expression, T_BOOLEAN);
      const cond = this.emitExpression(stmt.expression);
      const body = this.emitStatementAsBlock(stmt.statement, indent);
      return `${pad}do ${body.trimStart()} while (${cond});`;
    }

    if (ts.isForStatement(stmt)) {
      return this.emitForStatement(stmt, indent);
    }

    if (ts.isSwitchStatement(stmt)) {
      return this.emitSwitchStatement(stmt, indent);
    }

    if (ts.isBreakStatement(stmt)) {
      if (stmt.label) unsupported(stmt, "labeled break");
      return `${pad}break;`;
    }

    if (ts.isContinueStatement(stmt)) {
      if (stmt.label) unsupported(stmt, "labeled continue");
      this.checkContinueAllowed(stmt);
      return `${pad}continue;`;
    }

    if (ts.isBlock(stmt)) {
      this.scope.push();
      const out = this.emitBlock(stmt, indent);
      this.scope.pop();
      return out;
    }

    unsupported(stmt, "statement");
  }

  private emitStatementAsBlock(stmt: ts.Statement, indent: number): string {
    const pad = "  ".repeat(indent);
    if (ts.isBlock(stmt)) {
      this.scope.push();
      const out = this.emitBlock(stmt, indent);
      this.scope.pop();
      return out;
    }
    this.scope.push();
    const inner = this.emitStatement(stmt, indent + 1);
    this.scope.pop();
    return `${pad}{\n${inner}\n${pad}}`;
  }

  private emitVarDecls(list: ts.VariableDeclarationList, indent: number): string {
    const pad = "  ".repeat(indent);
    const isConst = (list.flags & ts.NodeFlags.Const) !== 0;
    const isLet = (list.flags & ts.NodeFlags.Let) !== 0;
    if (!isConst && !isLet) {
      throw new CodegenError(list, "var is unsupported; use let or const");
    }
    const lines: string[] = [];
    for (const d of list.declarations) {
      const { type, cName, initStr } = this.declareVar(d, isConst);
      lines.push(`${pad}${cTypeName(type)} ${cName}${initStr};`);
    }
    return lines.join("\n");
  }

  private declareVar(
    decl: ts.VariableDeclaration,
    isConst: boolean,
  ): { type: TopazType; cName: string; initStr: string } {
    if (!ts.isIdentifier(decl.name)) {
      throw new CodegenError(decl, "variable name must be a simple identifier");
    }
    if (!decl.initializer) {
      throw new CodegenError(decl, "variable declaration must have an initializer");
    }
    const name = decl.name.text;

    let type: TopazType;
    let initExpr: string;
    if (decl.type) {
      type = this.typeFromAnnotation(decl.type, decl);
      // emitWithExpected threads `type` through ArrayLiteral / NewExpression
      // context typing and applies class -> interface coercion when needed.
      initExpr = this.emitWithExpected(decl.initializer, type);
    } else {
      const initIsBareNew =
        ts.isNewExpression(decl.initializer) &&
        ts.isIdentifier(decl.initializer.expression) &&
        (decl.initializer.expression.text === "Map" ||
          decl.initializer.expression.text === "Set") &&
        (!decl.initializer.typeArguments || decl.initializer.typeArguments.length === 0);
      if (initIsBareNew) {
        throw new CodegenError(
          decl.initializer,
          "cannot infer constructor type arguments; write `new Map<K, V>()` / `new Set<T>()` or annotate the binding",
        );
      }
      type = this.inferType(decl.initializer);
      if (ts.isArrayLiteralExpression(decl.initializer)) {
        initExpr = this.emitArrayLiteral(decl.initializer, type);
      } else if (ts.isNewExpression(decl.initializer)) {
        initExpr = this.emitNewExpression(decl.initializer, type);
      } else {
        initExpr = this.emitExpression(decl.initializer);
      }
    }
    this.scope.declare(name, type, isConst, decl);
    return { type, cName: name, initStr: ` = ${initExpr}` };
  }

  private emitForStatement(stmt: ts.ForStatement, indent: number): string {
    const pad = "  ".repeat(indent);
    this.scope.push();
    try {
      let initStr = "";
      if (stmt.initializer) {
        if (ts.isVariableDeclarationList(stmt.initializer)) {
          const init = stmt.initializer;
          if (init.declarations.length !== 1) {
            throw new CodegenError(init, "for-init with multiple declarations is unsupported");
          }
          const isConst = (init.flags & ts.NodeFlags.Const) !== 0;
          const isLet = (init.flags & ts.NodeFlags.Let) !== 0;
          if (!isConst && !isLet) {
            throw new CodegenError(init, "var is unsupported; use let or const");
          }
          const { type, cName, initStr: vInit } = this.declareVar(init.declarations[0]!, isConst);
          initStr = `${cTypeName(type)} ${cName}${vInit}`;
        } else {
          initStr = this.emitExpression(stmt.initializer as ts.Expression);
        }
      }
      if (!stmt.condition) {
        throw new CodegenError(stmt, "for-loop requires a condition");
      }
      this.expectType(stmt.condition, T_BOOLEAN);
      const condStr = this.emitExpression(stmt.condition);
      const incrStr = stmt.incrementor ? this.emitExpression(stmt.incrementor) : "";

      let bodyStr: string;
      if (ts.isBlock(stmt.statement)) {
        this.scope.push();
        bodyStr = this.emitBlock(stmt.statement, indent);
        this.scope.pop();
      } else {
        this.scope.push();
        const inner = this.emitStatement(stmt.statement, indent + 1);
        this.scope.pop();
        bodyStr = `${pad}{\n${inner}\n${pad}}`;
      }
      return `${pad}for (${initStr}; ${condStr}; ${incrStr}) ${bodyStr.trimStart()}`;
    } finally {
      this.scope.pop();
    }
  }

  private emitSwitchStatement(stmt: ts.SwitchStatement, indent: number): string {
    const pad = "  ".repeat(indent);
    const discType = this.inferType(stmt.expression);
    const clauses = stmt.caseBlock.clauses;

    let defaultClause: ts.DefaultClause | undefined;
    for (let i = 0; i < clauses.length; i++) {
      const c = clauses[i]!;
      if (ts.isDefaultClause(c)) {
        if (i !== clauses.length - 1) {
          throw new CodegenError(c, "`default` must be the last clause of `switch`");
        }
        defaultClause = c;
      }
    }

    type Group = { conds: ts.CaseClause[]; body: readonly ts.Statement[] };
    const groups: Group[] = [];
    let pending: ts.CaseClause[] = [];
    for (const c of clauses) {
      if (ts.isCaseClause(c)) {
        this.expectType(c.expression, discType);
        pending.push(c);
        if (c.statements.length > 0) {
          groups.push({ conds: pending, body: c.statements });
          pending = [];
        }
      }
    }
    if (pending.length > 0) {
      groups.push({ conds: pending, body: [] });
    }

    const isTerminator = (s: ts.Statement): boolean =>
      ts.isBreakStatement(s) ||
      ts.isReturnStatement(s) ||
      ts.isThrowStatement(s) ||
      ts.isContinueStatement(s);
    for (const g of groups) {
      if (g.body.length > 0 && !isTerminator(g.body[g.body.length - 1]!)) {
        throw new CodegenError(
          g.body[g.body.length - 1]!,
          "case body must end with `break` or `return` (implicit fall-through is unsupported)",
        );
      }
    }

    const id = this.switchCounter++;
    const tmp = `__topaz_sw_${id}`;
    const discExpr = this.emitExpression(stmt.expression);

    const out: string[] = [];
    out.push(`${pad}{`);
    out.push(`${pad}  ${cTypeName(discType)} ${tmp} = ${discExpr};`);
    out.push(`${pad}  do {`);

    this.scope.push();
    try {
      const cmp = (rhs: string): string =>
        discType.kind === "string"
          ? `topaz_string_eq(${tmp}, ${rhs})`
          : `${tmp} == ${rhs}`;
      let first = true;
      for (const g of groups) {
        const conds = g.conds.map((c) => cmp(this.emitExpression(c.expression))).join(" || ");
        const head = first ? "if" : "else if";
        if (g.body.length === 0) {
          out.push(`${pad}    ${head} (${conds}) { break; }`);
        } else {
          out.push(`${pad}    ${head} (${conds}) {`);
          for (const s of g.body) {
            out.push(this.emitStatement(s, indent + 3));
          }
          out.push(`${pad}    }`);
        }
        first = false;
      }
      if (defaultClause) {
        const head = first ? "if (1)" : "else";
        if (defaultClause.statements.length === 0) {
          out.push(`${pad}    ${head} { break; }`);
        } else {
          out.push(`${pad}    ${head} {`);
          for (const s of defaultClause.statements) {
            out.push(this.emitStatement(s, indent + 3));
          }
          out.push(`${pad}    }`);
        }
      }
    } finally {
      this.scope.pop();
    }

    out.push(`${pad}  } while (0);`);
    out.push(`${pad}}`);
    return out.join("\n");
  }

  private checkContinueAllowed(stmt: ts.ContinueStatement): void {
    let p: ts.Node | undefined = stmt.parent;
    while (p) {
      if (
        ts.isWhileStatement(p) ||
        ts.isDoStatement(p) ||
        ts.isForStatement(p) ||
        ts.isForInStatement(p) ||
        ts.isForOfStatement(p)
      ) {
        return;
      }
      if (ts.isSwitchStatement(p)) {
        throw new CodegenError(
          stmt,
          "`continue` inside `switch` is unsupported (switch lowers to do/while(0))",
        );
      }
      if (ts.isFunctionLike(p) || ts.isSourceFile(p)) {
        throw new CodegenError(stmt, "`continue` outside of a loop");
      }
      p = p.parent;
    }
  }

  private emitExpression(expr: ts.Expression): string {
    if (ts.isNumericLiteral(expr)) {
      const t = expr.text;
      return /[.eE]/.test(t) ? t : `${t}.0`;
    }
    if (expr.kind === ts.SyntaxKind.TrueKeyword) return "true";
    if (expr.kind === ts.SyntaxKind.FalseKeyword) return "false";
    if (expr.kind === ts.SyntaxKind.ThisKeyword) {
      if (!this.currentClass) {
        throw new CodegenError(expr, "`this` is only valid inside class methods or constructors");
      }
      return TOPAZ_THIS;
    }
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
      return this.emitStringLiteral(expr);
    }
    if (ts.isIdentifier(expr)) {
      if (!this.scope.lookup(expr.text)) {
        throw new CodegenError(expr, `unknown identifier '${expr.text}'`);
      }
      return expr.text;
    }
    if (ts.isParenthesizedExpression(expr)) {
      return `(${this.emitExpression(expr.expression)})`;
    }
    if (ts.isPropertyAccessExpression(expr)) {
      const baseType = this.inferType(expr.expression);
      if (baseType.kind === "string" && expr.name.text === "length") {
        return `((topaz_number)(${this.emitExpression(expr.expression)}).len)`;
      }
      if (isArrayType(baseType) && expr.name.text === "length") {
        return `((topaz_number)(${this.emitExpression(expr.expression)})->len)`;
      }
      if ((isMapType(baseType) || isSetType(baseType)) && expr.name.text === "size") {
        return `((topaz_number)(${this.emitExpression(expr.expression)})->size)`;
      }
      if (isClassType(baseType)) {
        const cls = this.classes.get(classNameOf(baseType)!)!;
        if (cls.fields.has(expr.name.text)) {
          return `((${this.emitExpression(expr.expression)})->${expr.name.text})`;
        }
        if (cls.methods.has(expr.name.text)) {
          throw new CodegenError(
            expr,
            `method '${expr.name.text}' cannot be used as a value (call it instead)`,
          );
        }
        throw new CodegenError(
          expr,
          `class '${cls.name}' has no member '${expr.name.text}'`,
        );
      }
      if (isInterfaceType(baseType)) {
        const iface = this.interfaces.get(interfaceNameOf(baseType)!)!;
        const fname = expr.name.text;
        if (iface.fields.has(fname)) {
          const id = this.tmpCounter++;
          const tmp = `__topaz_ib_${id}`;
          const baseStr = this.emitExpression(expr.expression);
          return `({ ${cTypeName(baseType)} ${tmp} = ${baseStr}; ${tmp}.vt->get_${fname}(${tmp}.data); })`;
        }
        if (iface.methods.has(fname)) {
          throw new CodegenError(
            expr,
            `method '${fname}' cannot be used as a value (call it instead)`,
          );
        }
        throw new CodegenError(
          expr,
          `interface '${iface.name}' has no member '${fname}'`,
        );
      }
      throw new CodegenError(
        expr,
        `unsupported property access '.${expr.name.text}' on ${typeIdent(baseType)}`,
      );
    }
    if (ts.isElementAccessExpression(expr)) {
      const baseType = this.inferType(expr.expression);
      const elem = arrayElem(baseType);
      if (!elem) {
        throw new CodegenError(expr, `index access is only supported on Array (got ${typeIdent(baseType)})`);
      }
      this.expectType(expr.argumentExpression, T_NUMBER);
      const name = arrayShortName(baseType);
      return `topaz_array_${name}_at(${this.emitExpression(expr.expression)}, ${this.emitExpression(expr.argumentExpression)})`;
    }
    if (ts.isArrayLiteralExpression(expr)) {
      return this.emitArrayLiteral(expr, /* expected */ undefined);
    }
    if (ts.isPrefixUnaryExpression(expr)) {
      this.inferType(expr); // type-check
      const op = this.prefixOp(expr);
      return `(${op}${this.emitExpression(expr.operand)})`;
    }
    if (ts.isPostfixUnaryExpression(expr)) {
      this.inferType(expr);
      const op = this.postfixOp(expr);
      return `(${this.emitExpression(expr.operand)}${op})`;
    }
    if (ts.isBinaryExpression(expr)) {
      this.inferType(expr); // type-check + const-check
      const tok = expr.operatorToken.kind;
      // Element-access assignment lowers to topaz_array_X_set; compound
      // assignment on a[i] is unsupported because we'd evaluate the index twice.
      if (
        ts.isElementAccessExpression(expr.left) &&
        (tok === ts.SyntaxKind.EqualsToken ||
          tok === ts.SyntaxKind.PlusEqualsToken ||
          tok === ts.SyntaxKind.MinusEqualsToken ||
          tok === ts.SyntaxKind.AsteriskEqualsToken ||
          tok === ts.SyntaxKind.SlashEqualsToken ||
          tok === ts.SyntaxKind.PercentEqualsToken)
      ) {
        if (tok !== ts.SyntaxKind.EqualsToken) {
          throw new CodegenError(expr, "compound assignment on array element is unsupported; use a[i] = ...");
        }
        const baseType = this.inferType(expr.left.expression);
        const name = arrayShortName(baseType);
        const elem = arrayElem(baseType)!;
        const base = this.emitExpression(expr.left.expression);
        const idx = this.emitExpression(expr.left.argumentExpression);
        // Use emitWithExpected so class -> interface coercion fires when the
        // array is Array<Interface> and the RHS is a class instance.
        const val = this.emitWithExpected(expr.right, elem);
        return `topaz_array_${name}_set(${base}, ${idx}, ${val})`;
      }
      // Interface property assignment goes through the vtable's setter; no
      // C lvalue exists for the underlying field. Compound forms would need
      // to evaluate the base twice, so reject them.
      if (
        ts.isPropertyAccessExpression(expr.left) &&
        (tok === ts.SyntaxKind.EqualsToken ||
          tok === ts.SyntaxKind.PlusEqualsToken ||
          tok === ts.SyntaxKind.MinusEqualsToken ||
          tok === ts.SyntaxKind.AsteriskEqualsToken ||
          tok === ts.SyntaxKind.SlashEqualsToken ||
          tok === ts.SyntaxKind.PercentEqualsToken)
      ) {
        const baseT = this.inferType(expr.left.expression);
        if (isInterfaceType(baseT)) {
          if (tok !== ts.SyntaxKind.EqualsToken) {
            throw new CodegenError(
              expr,
              "compound assignment on interface field is unsupported; use iface.field = ...",
            );
          }
          const iname = interfaceNameOf(baseT)!;
          const iface = this.interfaces.get(iname)!;
          const fname = expr.left.name.text;
          const ftype = iface.fields.get(fname)!;
          const id = this.tmpCounter++;
          const tmp = `__topaz_ib_${id}`;
          const baseStr = this.emitExpression(expr.left.expression);
          const rhsStr = this.emitWithExpected(expr.right, ftype);
          // The vtable setter returns void, so this expression's value is
          // void. Chained assignment (`x = (iface.field = v)`) is therefore
          // unsupported — acceptable for now since it's a rare pattern.
          return `({ ${cTypeName(baseT)} ${tmp} = ${baseStr}; ${tmp}.vt->set_${fname}(${tmp}.data, ${rhsStr}); })`;
        }
      }
      // Plain assignment with rhs coercion (covers `let a: Shape = ...; a = new Circle(...)`
      // as well as `obj.field = new Circle(...)` when field is an interface).
      if (tok === ts.SyntaxKind.EqualsToken) {
        const lt = this.inferType(expr.left);
        const rt = this.inferType(expr.right);
        if (!typeEq(lt, rt) && this.isAssignableTo(rt, lt)) {
          const lhsStr = this.emitExpression(expr.left);
          const rhsStr = this.emitWithExpected(expr.right, lt);
          return `(${lhsStr} = ${rhsStr})`;
        }
      }
      // JS `%` is fmod for number; C's `%` rejects double, so always lower.
      if (tok === ts.SyntaxKind.PercentToken) {
        return `topaz_fmod(${this.emitExpression(expr.left)}, ${this.emitExpression(expr.right)})`;
      }
      if (tok === ts.SyntaxKind.PercentEqualsToken) {
        const lhs = this.emitExpression(expr.left);
        return `(${lhs} = topaz_fmod(${lhs}, ${this.emitExpression(expr.right)}))`;
      }
      if (tok === ts.SyntaxKind.PlusToken && this.inferType(expr.left).kind === "string") {
        return `topaz_string_concat(${this.emitExpression(expr.left)}, ${this.emitExpression(expr.right)})`;
      }
      if (
        tok === ts.SyntaxKind.PlusEqualsToken &&
        this.inferType(expr.left).kind === "string"
      ) {
        const lhs = this.emitExpression(expr.left);
        return `(${lhs} = topaz_string_concat(${lhs}, ${this.emitExpression(expr.right)}))`;
      }
      if (
        (tok === ts.SyntaxKind.EqualsEqualsEqualsToken ||
          tok === ts.SyntaxKind.ExclamationEqualsEqualsToken) &&
        this.inferType(expr.left).kind === "string"
      ) {
        const inner = `topaz_string_eq(${this.emitExpression(expr.left)}, ${this.emitExpression(expr.right)})`;
        return tok === ts.SyntaxKind.EqualsEqualsEqualsToken ? inner : `(!${inner})`;
      }
      const op = this.binaryOp(expr.operatorToken);
      return `(${this.emitExpression(expr.left)} ${op} ${this.emitExpression(expr.right)})`;
    }
    if (ts.isCallExpression(expr)) {
      return this.emitCall(expr);
    }
    if (ts.isNewExpression(expr)) {
      return this.emitNewExpression(expr, /* expected */ undefined);
    }
    unsupported(expr, "expression");
  }

  private emitArrayLiteral(
    expr: ts.ArrayLiteralExpression,
    expected: TopazType | undefined,
  ): string {
    for (const e of expr.elements) {
      if (ts.isSpreadElement(e) || e.kind === ts.SyntaxKind.OmittedExpression) {
        throw new CodegenError(e, "spread / holes in array literals are unsupported");
      }
    }
    let arrType: TopazType;
    if (expr.elements.length === 0) {
      if (!expected || !isArrayType(expected)) {
        throw new CodegenError(
          expr,
          "cannot infer element type of empty array literal; add an `Array<T>` annotation",
        );
      }
      arrType = expected;
    } else if (expected && isArrayType(expected)) {
      // With a known expected Array<T>, use T as the element type so each
      // element can coerce to it (class -> interface). This is required for
      // mixed-class Array<Interface> literals, where elements can have
      // different concrete types as long as they all implement T.
      arrType = expected;
    } else {
      const elem = this.inferType(expr.elements[0]!);
      for (let i = 1; i < expr.elements.length; i++) {
        this.expectType(expr.elements[i]!, elem);
      }
      const arr = arrayOf(elem);
      if (!arr) {
        throw new CodegenError(expr, `no Array monomorph for element type ${typeIdent(elem)}`);
      }
      arrType = arr;
      this.recordArrayMonomorph(arrType);
    }
    const elemType = arrayElem(arrType)!;
    const name = arrayShortName(arrType);
    const id = this.tmpCounter++;
    const tmp = `__topaz_arr_${id}`;
    // GCC/clang statement-expression: build, fill, yield the pointer.
    const parts: string[] = [];
    parts.push(`topaz_array_${name} *${tmp} = topaz_array_${name}_new();`);
    if (expr.elements.length > 0) {
      parts.push(`topaz_array_${name}_reserve(${tmp}, ${expr.elements.length});`);
    }
    for (const e of expr.elements) {
      parts.push(`topaz_array_${name}_push(${tmp}, ${this.emitWithExpected(e as ts.Expression, elemType)});`);
    }
    return `({ ${parts.join(" ")} ${tmp}; })`;
  }

  private emitNewExpression(
    expr: ts.NewExpression,
    expected: TopazType | undefined,
  ): string {
    if (!ts.isIdentifier(expr.expression)) {
      throw new CodegenError(expr, "only `new Map<K, V>()`, `new Set<T>()`, and class instantiation are supported");
    }
    const name = expr.expression.text;
    if (name === "Array") {
      throw new CodegenError(
        expr,
        "use array literal syntax (`[...]` or `[]`) instead of `new Array()`",
      );
    }
    if ((name === "Map" || name === "Set") && expr.arguments && expr.arguments.length > 0) {
      throw new CodegenError(
        expr,
        `${name}() constructor arguments are unsupported (initialize via .set/.add)`,
      );
    }
    if (name === "Map") {
      let mapType: TopazType;
      if (expr.typeArguments && expr.typeArguments.length === 2) {
        const k = this.typeFromAnnotation(expr.typeArguments[0]!, expr);
        const v = this.typeFromAnnotation(expr.typeArguments[1]!, expr);
        const t = mapOf(k, v);
        if (!t) {
          throw new CodegenError(expr, `no Map monomorph for key=${typeIdent(k)}, value=${typeIdent(v)}`);
        }
        if (expected && !typeEq(expected, t)) {
          throw new CodegenError(expr, `type mismatch: expected ${typeIdent(expected)}, got ${typeIdent(t)}`);
        }
        mapType = t;
      } else if (expr.typeArguments && expr.typeArguments.length !== 2) {
        throw new CodegenError(expr, "Map<K, V> requires exactly two type arguments");
      } else {
        if (!expected || !isMapType(expected)) {
          throw new CodegenError(
            expr,
            "cannot infer Map type arguments; write `new Map<K, V>()` or annotate the binding",
          );
        }
        mapType = expected;
      }
      this.recordMapMonomorph(mapType);
      return `topaz_map_${mapShortName(mapType)}_new()`;
    }
    if (name === "Set") {
      let setType: TopazType;
      if (expr.typeArguments && expr.typeArguments.length === 1) {
        const elem = this.typeFromAnnotation(expr.typeArguments[0]!, expr);
        const t = setOf(elem);
        if (!t) {
          throw new CodegenError(expr, `no Set monomorph for element type ${typeIdent(elem)}`);
        }
        if (expected && !typeEq(expected, t)) {
          throw new CodegenError(expr, `type mismatch: expected ${typeIdent(expected)}, got ${typeIdent(t)}`);
        }
        setType = t;
      } else if (expr.typeArguments && expr.typeArguments.length !== 1) {
        throw new CodegenError(expr, "Set<T> requires exactly one type argument");
      } else {
        if (!expected || !isSetType(expected)) {
          throw new CodegenError(
            expr,
            "cannot infer Set type argument; write `new Set<T>()` or annotate the binding",
          );
        }
        setType = expected;
      }
      this.recordSetMonomorph(setType);
      return `topaz_set_${setShortName(setType)}_new()`;
    }
    if (this.interfaces.has(name)) {
      throw new CodegenError(expr, `cannot \`new\` an interface '${name}'; instantiate an implementing class instead`);
    }
    // Phase 1.4c-3: `new Box<number>()` mangles to the substituted class
    // name and dispatches through the same path as concrete classes.
    let className = name;
    if (this.genericClasses.has(name)) {
      const t = this.instantiateGenericClass(name, expr.typeArguments, expr);
      className = classNameOf(t)!;
    } else if (expr.typeArguments && expr.typeArguments.length > 0) {
      if (this.classes.has(name)) {
        throw new CodegenError(expr, `class '${name}' takes no type arguments`);
      }
    }
    if (this.classes.has(className)) {
      const cls = this.classes.get(className)!;
      const args = expr.arguments ?? ([] as readonly ts.Expression[]);
      const t = classOf(className);
      // Class -> interface coercion happens at the caller's site (the
      // surrounding emitWithExpected); here we only need to confirm the new
      // expression isn't being asked to produce a different concrete type.
      if (expected && !typeEq(expected, t) && !this.isAssignableTo(t, expected)) {
        throw new CodegenError(expr, `type mismatch: expected ${typeIdent(expected)}, got ${typeIdent(t)}`);
      }
      if (!cls.ctor) {
        // Reachable only when a class has no fields (we require a ctor when
        // fields exist), so this is a structurally empty class.
        if (args.length !== 0) {
          throw new CodegenError(expr, `${cls.name}() takes no arguments`);
        }
        return `topaz_class_${className}_new()`;
      }
      const params = cls.ctor.params;
      if (args.length !== params.length) {
        throw new CodegenError(
          expr,
          `${cls.name}() expects ${params.length} argument(s), got ${args.length}`,
        );
      }
      const argStr = args
        .map((a, i) => this.emitWithExpected(a, params[i]!.type))
        .join(", ");
      return `topaz_class_${className}_new(${argStr})`;
    }
    throw new CodegenError(expr, `\`new ${name}\` is unsupported`);
  }

  private emitStringLiteral(expr: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral): string {
    const cooked = expr.text;
    let escaped = '"';
    let byteLen = 0;
    for (let i = 0; i < cooked.length; i++) {
      const c = cooked.charCodeAt(i);
      if (c >= 0x80) {
        throw new CodegenError(
          expr,
          "non-ASCII characters in string literals are unsupported (UTF-16 length divergence)",
        );
      }
      if (c === 0x22) escaped += '\\"';
      else if (c === 0x5c) escaped += "\\\\";
      else if (c === 0x0a) escaped += "\\n";
      else if (c === 0x0d) escaped += "\\r";
      else if (c === 0x09) escaped += "\\t";
      else if (c === 0x00) escaped += "\\0";
      else if (c < 0x20 || c === 0x7f) {
        escaped += `\\x${c.toString(16).padStart(2, "0")}`;
      } else {
        escaped += String.fromCharCode(c);
      }
      byteLen++;
    }
    escaped += '"';
    return `((topaz_string){ ${escaped}, ${byteLen} })`;
  }

  private prefixOp(expr: ts.PrefixUnaryExpression): string {
    switch (expr.operator) {
      case ts.SyntaxKind.MinusToken: return "-";
      case ts.SyntaxKind.PlusToken: return "+";
      case ts.SyntaxKind.ExclamationToken: return "!";
      case ts.SyntaxKind.PlusPlusToken: return "++";
      case ts.SyntaxKind.MinusMinusToken: return "--";
      default: unsupported(expr, "prefix unary operator");
    }
  }

  private postfixOp(expr: ts.PostfixUnaryExpression): string {
    switch (expr.operator) {
      case ts.SyntaxKind.PlusPlusToken: return "++";
      case ts.SyntaxKind.MinusMinusToken: return "--";
      default: unsupported(expr, "postfix unary operator");
    }
  }

  private binaryOp(tok: ts.BinaryOperatorToken): string {
    switch (tok.kind) {
      case ts.SyntaxKind.PlusToken: return "+";
      case ts.SyntaxKind.MinusToken: return "-";
      case ts.SyntaxKind.AsteriskToken: return "*";
      case ts.SyntaxKind.SlashToken: return "/";
      case ts.SyntaxKind.PercentToken: return "%";
      case ts.SyntaxKind.LessThanToken: return "<";
      case ts.SyntaxKind.LessThanEqualsToken: return "<=";
      case ts.SyntaxKind.GreaterThanToken: return ">";
      case ts.SyntaxKind.GreaterThanEqualsToken: return ">=";
      case ts.SyntaxKind.EqualsEqualsEqualsToken: return "==";
      case ts.SyntaxKind.ExclamationEqualsEqualsToken: return "!=";
      case ts.SyntaxKind.AmpersandAmpersandToken: return "&&";
      case ts.SyntaxKind.BarBarToken: return "||";
      case ts.SyntaxKind.EqualsToken: return "=";
      case ts.SyntaxKind.PlusEqualsToken: return "+=";
      case ts.SyntaxKind.MinusEqualsToken: return "-=";
      case ts.SyntaxKind.AsteriskEqualsToken: return "*=";
      case ts.SyntaxKind.SlashEqualsToken: return "/=";
      case ts.SyntaxKind.PercentEqualsToken: return "%=";
      case ts.SyntaxKind.EqualsEqualsToken:
      case ts.SyntaxKind.ExclamationEqualsToken:
        throw new CodegenError(tok, "loose equality (== / !=) is unsupported; use === / !==");
      default:
        unsupported(tok, "binary operator");
    }
  }

  private emitCall(expr: ts.CallExpression): string {
    const callee = expr.expression;

    if (
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === "console" &&
      callee.name.text === "log"
    ) {
      if (expr.arguments.length !== 1) {
        throw new CodegenError(expr, "console.log expects exactly one argument");
      }
      const arg = expr.arguments[0]!;
      const t = this.inferType(arg);
      if (isReferenceType(t) || isInterfaceType(t)) {
        throw new CodegenError(arg, `console.log on ${t} is unsupported`);
      }
      const fn =
        t.kind === "boolean" ? "topaz_console_log_boolean"
        : t.kind === "string" ? "topaz_console_log_string"
        : "topaz_console_log_number";
      return `${fn}(${this.emitExpression(arg)})`;
    }

    if (ts.isPropertyAccessExpression(callee)) {
      const baseType = this.inferType(callee.expression);
      if (isArrayType(baseType)) {
        return this.emitArrayMethodCall(expr, callee, baseType);
      }
      if (isMapType(baseType)) {
        return this.emitMapMethodCall(expr, callee, baseType);
      }
      if (isSetType(baseType)) {
        return this.emitSetMethodCall(expr, callee, baseType);
      }
      if (isClassType(baseType)) {
        return this.emitClassMethodCall(expr, callee, baseType);
      }
      if (isInterfaceType(baseType)) {
        return this.emitInterfaceMethodCall(expr, callee, baseType);
      }
      throw new CodegenError(callee, `unsupported method '.${callee.name.text}' on ${typeIdent(baseType)}`);
    }

    if (ts.isIdentifier(callee)) {
      if (this.genericFunctions.has(callee.text)) {
        const resolved = this.resolveGenericCall(callee, expr)!;
        const args = expr.arguments
          .map((a, i) => this.emitWithExpected(a, resolved.sig.params[i]!.type))
          .join(", ");
        return `${resolved.mangled}(${args})`;
      }
      const sig = this.functionSigs.get(callee.text);
      if (!sig) {
        throw new CodegenError(callee, `unknown function '${callee.text}'`);
      }
      if (expr.arguments.length !== sig.params.length) {
        throw new CodegenError(
          expr,
          `${callee.text}() expects ${sig.params.length} argument(s), got ${expr.arguments.length}`,
        );
      }
      const args = expr.arguments
        .map((a, i) => this.emitWithExpected(a, sig.params[i]!.type))
        .join(", ");
      return `${callee.text}(${args})`;
    }

    unsupported(callee, "call target");
  }

  private emitArrayMethodCall(
    expr: ts.CallExpression,
    callee: ts.PropertyAccessExpression,
    baseType: TopazType,
  ): string {
    const name = arrayShortName(baseType);
    const elem = arrayElem(baseType)!;
    const method = callee.name.text;
    const base = this.emitExpression(callee.expression);
    if (method === "push") {
      if (expr.arguments.length !== 1) {
        throw new CodegenError(expr, "Array.push expects exactly one argument");
      }
      return `topaz_array_${name}_push(${base}, ${this.emitWithExpected(expr.arguments[0]!, elem)})`;
    }
    if (method === "pop") {
      if (expr.arguments.length !== 0) {
        throw new CodegenError(expr, "Array.pop expects no arguments");
      }
      return `topaz_array_${name}_pop(${base})`;
    }
    throw new CodegenError(callee, `unsupported method '.${method}' on ${typeIdent(baseType)}`);
  }

  private emitMapMethodCall(
    expr: ts.CallExpression,
    callee: ts.PropertyAccessExpression,
    baseType: TopazType,
  ): string {
    const name = mapShortName(baseType);
    const k = mapKey(baseType)!;
    const v = mapValue(baseType)!;
    const method = callee.name.text;
    const base = this.emitExpression(callee.expression);
    if (method === "set") {
      if (expr.arguments.length !== 2) {
        throw new CodegenError(expr, "Map.set expects exactly two arguments");
      }
      // emitWithExpected enables class -> interface coercion for the value
      // when V is an interface; keys are still scalar so this is a no-op for
      // them, but the helper handles both uniformly.
      const ke = this.emitWithExpected(expr.arguments[0]!, k);
      const ve = this.emitWithExpected(expr.arguments[1]!, v);
      return `topaz_map_${name}_set(${base}, ${ke}, ${ve})`;
    }
    if (method === "get") {
      if (expr.arguments.length !== 1) {
        throw new CodegenError(expr, "Map.get expects exactly one argument");
      }
      return `topaz_map_${name}_get(${base}, ${this.emitWithExpected(expr.arguments[0]!, k)})`;
    }
    if (method === "has") {
      if (expr.arguments.length !== 1) {
        throw new CodegenError(expr, "Map.has expects exactly one argument");
      }
      return `topaz_map_${name}_has(${base}, ${this.emitWithExpected(expr.arguments[0]!, k)})`;
    }
    if (method === "delete") {
      if (expr.arguments.length !== 1) {
        throw new CodegenError(expr, "Map.delete expects exactly one argument");
      }
      return `topaz_map_${name}_delete(${base}, ${this.emitWithExpected(expr.arguments[0]!, k)})`;
    }
    throw new CodegenError(callee, `unsupported method '.${method}' on ${typeIdent(baseType)}`);
  }

  private emitClassMethodCall(
    expr: ts.CallExpression,
    callee: ts.PropertyAccessExpression,
    baseType: TopazType,
  ): string {
    const cls = this.classes.get(classNameOf(baseType)!)!;
    const mname = callee.name.text;
    const method = cls.methods.get(mname);
    if (!method) {
      if (cls.fields.has(mname)) {
        throw new CodegenError(callee, `'${mname}' is a field, not a method, on class '${cls.name}'`);
      }
      throw new CodegenError(callee, `class '${cls.name}' has no method '${mname}'`);
    }
    if (expr.arguments.length !== method.params.length) {
      throw new CodegenError(
        expr,
        `${cls.name}.${mname} expects ${method.params.length} argument(s), got ${expr.arguments.length}`,
      );
    }
    const base = this.emitExpression(callee.expression);
    const argParts = [
      base,
      ...expr.arguments.map((a, i) => this.emitWithExpected(a, method.params[i]!.type)),
    ];
    return `topaz_class_${cls.name}_method_${mname}(${argParts.join(", ")})`;
  }

  private emitInterfaceMethodCall(
    expr: ts.CallExpression,
    callee: ts.PropertyAccessExpression,
    baseType: TopazType,
  ): string {
    const iface = this.interfaces.get(interfaceNameOf(baseType)!)!;
    const mname = callee.name.text;
    const sig = iface.methods.get(mname);
    if (!sig) {
      if (iface.fields.has(mname)) {
        throw new CodegenError(callee, `'${mname}' is a field, not a method, on interface '${iface.name}'`);
      }
      throw new CodegenError(callee, `interface '${iface.name}' has no method '${mname}'`);
    }
    if (expr.arguments.length !== sig.params.length) {
      throw new CodegenError(
        expr,
        `${iface.name}.${mname} expects ${sig.params.length} argument(s), got ${expr.arguments.length}`,
      );
    }
    const id = this.tmpCounter++;
    const tmp = `__topaz_ib_${id}`;
    const baseStr = this.emitExpression(callee.expression);
    const argParts = [
      `${tmp}.data`,
      ...expr.arguments.map((a, i) => this.emitWithExpected(a, sig.params[i]!.type)),
    ];
    return `({ ${cTypeName(baseType)} ${tmp} = ${baseStr}; ${tmp}.vt->${mname}(${argParts.join(", ")}); })`;
  }

  private emitSetMethodCall(
    expr: ts.CallExpression,
    callee: ts.PropertyAccessExpression,
    baseType: TopazType,
  ): string {
    const name = setShortName(baseType);
    const elem = setElem(baseType)!;
    const method = callee.name.text;
    const base = this.emitExpression(callee.expression);
    if (method === "add") {
      if (expr.arguments.length !== 1) {
        throw new CodegenError(expr, "Set.add expects exactly one argument");
      }
      return `topaz_set_${name}_add(${base}, ${this.emitWithExpected(expr.arguments[0]!, elem)})`;
    }
    if (method === "has") {
      if (expr.arguments.length !== 1) {
        throw new CodegenError(expr, "Set.has expects exactly one argument");
      }
      return `topaz_set_${name}_has(${base}, ${this.emitWithExpected(expr.arguments[0]!, elem)})`;
    }
    if (method === "delete") {
      if (expr.arguments.length !== 1) {
        throw new CodegenError(expr, "Set.delete expects exactly one argument");
      }
      return `topaz_set_${name}_delete(${base}, ${this.emitWithExpected(expr.arguments[0]!, elem)})`;
    }
    throw new CodegenError(callee, `unsupported method '.${method}' on ${typeIdent(baseType)}`);
  }

  private inferType(expr: ts.Expression): TopazType {
    if (ts.isNumericLiteral(expr)) return T_NUMBER;
    if (expr.kind === ts.SyntaxKind.TrueKeyword || expr.kind === ts.SyntaxKind.FalseKeyword) {
      return T_BOOLEAN;
    }
    if (expr.kind === ts.SyntaxKind.ThisKeyword) {
      if (!this.currentClass) {
        throw new CodegenError(expr, "`this` is only valid inside class methods or constructors");
      }
      return classOf(this.currentClass);
    }
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
      return T_STRING;
    }
    if (ts.isParenthesizedExpression(expr)) return this.inferType(expr.expression);
    if (ts.isIdentifier(expr)) {
      const b = this.scope.lookup(expr.text);
      if (!b) throw new CodegenError(expr, `unknown identifier '${expr.text}'`);
      return b.type;
    }
    if (ts.isPropertyAccessExpression(expr)) {
      const baseType = this.inferType(expr.expression);
      if (baseType.kind === "string" && expr.name.text === "length") {
        return T_NUMBER;
      }
      if (isArrayType(baseType) && expr.name.text === "length") {
        return T_NUMBER;
      }
      if ((isMapType(baseType) || isSetType(baseType)) && expr.name.text === "size") {
        return T_NUMBER;
      }
      if (isClassType(baseType)) {
        const cls = this.classes.get(classNameOf(baseType)!)!;
        const fieldType = cls.fields.get(expr.name.text);
        if (fieldType) return fieldType;
        if (cls.methods.has(expr.name.text)) {
          throw new CodegenError(
            expr,
            `method '${expr.name.text}' cannot be used as a value (call it instead)`,
          );
        }
        throw new CodegenError(
          expr,
          `class '${cls.name}' has no member '${expr.name.text}'`,
        );
      }
      if (isInterfaceType(baseType)) {
        const iface = this.interfaces.get(interfaceNameOf(baseType)!)!;
        const f = iface.fields.get(expr.name.text);
        if (f) return f;
        if (iface.methods.has(expr.name.text)) {
          throw new CodegenError(
            expr,
            `method '${expr.name.text}' cannot be used as a value (call it instead)`,
          );
        }
        throw new CodegenError(
          expr,
          `interface '${iface.name}' has no member '${expr.name.text}'`,
        );
      }
      throw new CodegenError(
        expr,
        `unsupported property access '.${expr.name.text}' on ${typeIdent(baseType)}`,
      );
    }
    if (ts.isElementAccessExpression(expr)) {
      const baseType = this.inferType(expr.expression);
      const elem = arrayElem(baseType);
      if (!elem) {
        throw new CodegenError(expr, `index access is only supported on Array (got ${typeIdent(baseType)})`);
      }
      this.expectType(expr.argumentExpression, T_NUMBER);
      return elem;
    }
    if (ts.isArrayLiteralExpression(expr)) {
      if (expr.elements.length === 0) {
        throw new CodegenError(
          expr,
          "cannot infer element type of empty array literal; add an `Array<T>` annotation",
        );
      }
      const first = expr.elements[0]!;
      const elem = this.inferType(first);
      for (let i = 1; i < expr.elements.length; i++) {
        this.expectType(expr.elements[i]!, elem);
      }
      const arr = arrayOf(elem);
      if (!arr) {
        throw new CodegenError(expr, `no Array monomorph for element type ${typeIdent(elem)}`);
      }
      this.recordArrayMonomorph(arr);
      return arr;
    }
    if (ts.isPrefixUnaryExpression(expr)) {
      switch (expr.operator) {
        case ts.SyntaxKind.MinusToken:
        case ts.SyntaxKind.PlusToken:
          this.expectType(expr.operand, T_NUMBER);
          return T_NUMBER;
        case ts.SyntaxKind.ExclamationToken:
          this.expectType(expr.operand, T_BOOLEAN);
          return T_BOOLEAN;
        case ts.SyntaxKind.PlusPlusToken:
        case ts.SyntaxKind.MinusMinusToken:
          this.checkAssignTarget(expr.operand, expr);
          this.expectType(expr.operand, T_NUMBER);
          return T_NUMBER;
        default:
          unsupported(expr, "prefix unary operator");
      }
    }
    if (ts.isPostfixUnaryExpression(expr)) {
      this.checkAssignTarget(expr.operand, expr);
      this.expectType(expr.operand, T_NUMBER);
      return T_NUMBER;
    }
    if (ts.isBinaryExpression(expr)) {
      const kind = expr.operatorToken.kind;
      switch (kind) {
        case ts.SyntaxKind.PlusToken: {
          const lt = this.inferType(expr.left);
          if (lt.kind === "string") {
            this.expectType(expr.right, T_STRING);
            return T_STRING;
          }
          this.expectType(expr.left, T_NUMBER);
          this.expectType(expr.right, T_NUMBER);
          return T_NUMBER;
        }
        case ts.SyntaxKind.MinusToken:
        case ts.SyntaxKind.AsteriskToken:
        case ts.SyntaxKind.SlashToken:
        case ts.SyntaxKind.PercentToken:
          this.expectType(expr.left, T_NUMBER);
          this.expectType(expr.right, T_NUMBER);
          return T_NUMBER;
        case ts.SyntaxKind.LessThanToken:
        case ts.SyntaxKind.LessThanEqualsToken:
        case ts.SyntaxKind.GreaterThanToken:
        case ts.SyntaxKind.GreaterThanEqualsToken:
          this.expectType(expr.left, T_NUMBER);
          this.expectType(expr.right, T_NUMBER);
          return T_BOOLEAN;
        case ts.SyntaxKind.EqualsEqualsEqualsToken:
        case ts.SyntaxKind.ExclamationEqualsEqualsToken: {
          const lt = this.inferType(expr.left);
          this.expectType(expr.right, lt);
          return T_BOOLEAN;
        }
        case ts.SyntaxKind.AmpersandAmpersandToken:
        case ts.SyntaxKind.BarBarToken:
          this.expectType(expr.left, T_BOOLEAN);
          this.expectType(expr.right, T_BOOLEAN);
          return T_BOOLEAN;
        case ts.SyntaxKind.EqualsToken: {
          this.checkAssignTarget(expr.left, expr);
          const lt = this.inferType(expr.left);
          this.expectType(expr.right, lt);
          return lt;
        }
        case ts.SyntaxKind.PlusEqualsToken: {
          this.checkAssignTarget(expr.left, expr);
          const lt = this.inferType(expr.left);
          if (lt.kind === "string") {
            this.expectType(expr.right, T_STRING);
            return T_STRING;
          }
          this.expectType(expr.left, T_NUMBER);
          this.expectType(expr.right, T_NUMBER);
          return T_NUMBER;
        }
        case ts.SyntaxKind.MinusEqualsToken:
        case ts.SyntaxKind.AsteriskEqualsToken:
        case ts.SyntaxKind.SlashEqualsToken:
        case ts.SyntaxKind.PercentEqualsToken:
          this.checkAssignTarget(expr.left, expr);
          this.expectType(expr.left, T_NUMBER);
          this.expectType(expr.right, T_NUMBER);
          return T_NUMBER;
        case ts.SyntaxKind.EqualsEqualsToken:
        case ts.SyntaxKind.ExclamationEqualsToken:
          throw new CodegenError(
            expr.operatorToken,
            "loose equality (== / !=) is unsupported; use === / !==",
          );
        default:
          unsupported(expr.operatorToken, "binary operator");
      }
    }
    if (ts.isCallExpression(expr)) {
      const callee = expr.expression;
      if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "console" &&
        callee.name.text === "log"
      ) {
        throw new CodegenError(expr, "console.log returns void and cannot be used as a value");
      }
      if (ts.isPropertyAccessExpression(callee)) {
        const baseType = this.inferType(callee.expression);
        if (isArrayType(baseType)) {
          const elem = arrayElem(baseType)!;
          if (callee.name.text === "push") {
            throw new CodegenError(expr, "Array.push returns void in this dialect and cannot be used as a value");
          }
          if (callee.name.text === "pop") {
            return elem;
          }
          throw new CodegenError(callee, `unsupported method '.${callee.name.text}' on ${typeIdent(baseType)}`);
        }
        if (isMapType(baseType)) {
          const v = mapValue(baseType)!;
          const m = callee.name.text;
          if (m === "set") {
            throw new CodegenError(expr, "Map.set returns void in this dialect and cannot be used as a value");
          }
          if (m === "get") return v;
          if (m === "has" || m === "delete") return T_BOOLEAN;
          throw new CodegenError(callee, `unsupported method '.${m}' on ${typeIdent(baseType)}`);
        }
        if (isSetType(baseType)) {
          const m = callee.name.text;
          if (m === "add") {
            throw new CodegenError(expr, "Set.add returns void in this dialect and cannot be used as a value");
          }
          if (m === "has" || m === "delete") return T_BOOLEAN;
          throw new CodegenError(callee, `unsupported method '.${m}' on ${typeIdent(baseType)}`);
        }
        if (isClassType(baseType)) {
          const cls = this.classes.get(classNameOf(baseType)!)!;
          const method = cls.methods.get(callee.name.text);
          if (!method) {
            throw new CodegenError(callee, `class '${cls.name}' has no method '${callee.name.text}'`);
          }
          return method.returnType;
        }
        if (isInterfaceType(baseType)) {
          const iface = this.interfaces.get(interfaceNameOf(baseType)!)!;
          const sig = iface.methods.get(callee.name.text);
          if (!sig) {
            throw new CodegenError(callee, `interface '${iface.name}' has no method '${callee.name.text}'`);
          }
          return sig.returnType;
        }
        throw new CodegenError(callee, `unsupported method '.${callee.name.text}' on ${typeIdent(baseType)}`);
      }
      if (ts.isIdentifier(callee)) {
        if (this.genericFunctions.has(callee.text)) {
          const resolved = this.resolveGenericCall(callee, expr)!;
          return resolved.sig.returnType;
        }
        const sig = this.functionSigs.get(callee.text);
        if (!sig) throw new CodegenError(callee, `unknown function '${callee.text}'`);
        return sig.returnType;
      }
      unsupported(callee, "call target");
    }
    if (ts.isNewExpression(expr)) {
      if (!ts.isIdentifier(expr.expression)) {
        throw new CodegenError(expr, "only `new Map<K, V>()` and `new Set<T>()` are supported");
      }
      const name = expr.expression.text;
      if (name === "Map") {
        if (!expr.typeArguments || expr.typeArguments.length !== 2) {
          throw new CodegenError(expr, "Map<K, V> requires exactly two type arguments");
        }
        const k = this.typeFromAnnotation(expr.typeArguments[0]!, expr);
        const v = this.typeFromAnnotation(expr.typeArguments[1]!, expr);
        const t = mapOf(k, v);
        if (!t) throw new CodegenError(expr, `no Map monomorph for key=${typeIdent(k)}, value=${typeIdent(v)}`);
        this.recordMapMonomorph(t);
        return t;
      }
      if (name === "Set") {
        if (!expr.typeArguments || expr.typeArguments.length !== 1) {
          throw new CodegenError(expr, "Set<T> requires exactly one type argument");
        }
        const elem = this.typeFromAnnotation(expr.typeArguments[0]!, expr);
        const t = setOf(elem);
        if (!t) throw new CodegenError(expr, `no Set monomorph for element type ${typeIdent(elem)}`);
        this.recordSetMonomorph(t);
        return t;
      }
      if (this.genericClasses.has(name)) {
        return this.instantiateGenericClass(name, expr.typeArguments, expr);
      }
      if (this.classes.has(name)) {
        if (expr.typeArguments && expr.typeArguments.length > 0) {
          throw new CodegenError(expr, `class '${name}' takes no type arguments`);
        }
        return classOf(name);
      }
      if (this.interfaces.has(name)) {
        throw new CodegenError(expr, `cannot \`new\` an interface '${name}'; instantiate an implementing class instead`);
      }
      throw new CodegenError(expr, `\`new ${name}\` is unsupported`);
    }
    unsupported(expr, "expression");
  }

  private checkAssignTarget(target: ts.Expression, anchor: ts.Node): void {
    if (ts.isIdentifier(target)) {
      const b = this.scope.lookup(target.text);
      if (!b) {
        throw new CodegenError(target, `unknown identifier '${target.text}'`);
      }
      if (b.isConst) {
        throw new CodegenError(anchor, `cannot assign to const '${target.text}'`);
      }
      return;
    }
    if (ts.isElementAccessExpression(target)) {
      // `const arr = [...]` rebinds the binding, not the storage — element
      // assignment mutates through the pointer and is always allowed.
      const baseType = this.inferType(target.expression);
      if (!isArrayType(baseType)) {
        throw new CodegenError(target, `index assignment is only supported on Array (got ${typeIdent(baseType)})`);
      }
      return;
    }
    if (ts.isPropertyAccessExpression(target)) {
      // Compound assignment lowers to `(base)->field op= rhs`, which evaluates
      // `base` once in C. We still restrict the base to side-effect-free forms
      // so that a future lowering swap doesn't surprise anyone.
      if (!this.isSafeLvalueBase(target.expression)) {
        throw new CodegenError(target, "property assignment requires a simple base (identifier, `this`, or chained property access)");
      }
      const baseType = this.inferType(target.expression);
      if (isInterfaceType(baseType)) {
        const iface = this.interfaces.get(interfaceNameOf(baseType)!)!;
        if (!iface.fields.has(target.name.text)) {
          if (iface.methods.has(target.name.text)) {
            throw new CodegenError(target, `cannot assign to method '${target.name.text}'`);
          }
          throw new CodegenError(target, `interface '${iface.name}' has no field '${target.name.text}'`);
        }
        return;
      }
      if (!isClassType(baseType)) {
        throw new CodegenError(target, `property assignment is only supported on class instances or interface values (got ${typeIdent(baseType)})`);
      }
      const cls = this.classes.get(classNameOf(baseType)!)!;
      if (!cls.fields.has(target.name.text)) {
        if (cls.methods.has(target.name.text)) {
          throw new CodegenError(target, `cannot assign to method '${target.name.text}'`);
        }
        throw new CodegenError(target, `class '${cls.name}' has no field '${target.name.text}'`);
      }
      return;
    }
    throw new CodegenError(anchor, "assignment target must be an identifier, array index, or property access");
  }

  private isSafeLvalueBase(expr: ts.Expression): boolean {
    if (ts.isIdentifier(expr)) return true;
    if (expr.kind === ts.SyntaxKind.ThisKeyword) return true;
    if (ts.isParenthesizedExpression(expr)) return this.isSafeLvalueBase(expr.expression);
    if (ts.isPropertyAccessExpression(expr)) return this.isSafeLvalueBase(expr.expression);
    return false;
  }

  private expectType(expr: ts.Expression, expected: TopazType): void {
    const actual = this.inferType(expr);
    if (typeEq(actual, expected)) return;
    if (this.isAssignableTo(actual, expected)) return;
    throw new CodegenError(expr, `type mismatch: expected ${typeIdent(expected)}, got ${typeIdent(actual)}`);
  }

  // Phase 1.4b: class implementing an interface is the only implicit
  // conversion in the language. Same-type and class -> declared-interface
  // count as assignable. (No interface -> interface, no narrowing, no scalar
  // widening — divergence from TS structural typing.)
  private isAssignableTo(actual: TopazType, expected: TopazType): boolean {
    if (typeEq(actual, expected)) return true;
    if (isInterfaceType(expected) && isClassType(actual)) {
      return this.classImplements(classNameOf(actual)!, interfaceNameOf(expected)!);
    }
    return false;
  }

  // Type-check `expr` against `expected` and emit C source, inserting class ->
  // interface coercion (fat pointer compound literal) when needed. Use this
  // helper at every value-passing site (variable init, call argument, return
  // statement, assignment RHS) where the expected type is known.
  private emitWithExpected(expr: ts.Expression, expected: TopazType): string {
    if (ts.isArrayLiteralExpression(expr)) {
      // Array literal element types aren't interfaces (no Array<Interface> in
      // 1.4b), so no coercion is needed at the array itself.
      return this.emitArrayLiteral(expr, expected);
    }
    if (ts.isNewExpression(expr)) {
      // Bare `new Map()` / `new Set()` carries no type info; thread expected
      // through as context. Interface widening is impossible for Map/Set, so
      // forwarding expected unmodified is safe.
      const isBareMapSet =
        ts.isIdentifier(expr.expression) &&
        (expr.expression.text === "Map" || expr.expression.text === "Set") &&
        (!expr.typeArguments || expr.typeArguments.length === 0);
      if (isBareMapSet) {
        return this.emitNewExpression(expr, expected);
      }
      const newType = this.inferType(expr);
      // emitNewExpression only uses `expected` for bare `new Map()` / `new
      // Set()` context typing; suppress that when expected is interface so we
      // keep the class type and let coercion below wrap it.
      const ctx = isInterfaceType(expected) ? undefined : expected;
      const raw = this.emitNewExpression(expr, ctx);
      return this.applyCoercion(raw, newType, expected, expr);
    }
    const actual = this.inferType(expr);
    const raw = this.emitExpression(expr);
    return this.applyCoercion(raw, actual, expected, expr);
  }

  private applyCoercion(raw: string, actual: TopazType, expected: TopazType, anchor: ts.Node): string {
    if (typeEq(actual, expected)) return raw;
    if (isInterfaceType(expected) && isClassType(actual)) {
      const iname = interfaceNameOf(expected)!;
      const cname = classNameOf(actual)!;
      if (!this.classImplements(cname, iname)) {
        throw new CodegenError(
          anchor,
          `class '${cname}' does not implement interface '${iname}'`,
        );
      }
      return `((topaz_iface_${iname}){ .data = ${raw}, .vt = &topaz_iface_${iname}_for_${cname}_vt })`;
    }
    throw new CodegenError(anchor, `type mismatch: expected ${typeIdent(expected)}, got ${typeIdent(actual)}`);
  }
}

export function codegen(sf: ts.SourceFile): string {
  return new Emitter().emit(sf);
}
