// Topaz AST — discriminated unions consumed by the Topaz parser and
// (eventually) by the self-hosted codegen. Designed to compile under both
// stage1 (Node + tsc) and stage2 (self-hosted Topaz). Subset constraints:
//   - field types written as `T | undefined`, never the `f?: T` shorthand
//     (anon-class lowering rejects optional fields).
//   - discriminant field `kind` is always a string literal, so `switch (n.kind)`
//     narrows variants via the existing dunion machinery.
//   - no method members in node shapes — pure data, behavior lives in helper
//     functions outside the type.

// ============================================================
// Types
// ============================================================

export type TypeNode =
  | TypeRef
  | TypeUnion
  | TypeArrayShorthand
  | TypeLiteralNode
  | TypeFn
  | TypeStrLit
  | TypeNumLit
  | TypeVoid
  | TypeUnknown;

export type TypeRef = {
  kind: "type_ref";
  name: string;
  typeArgs: Array<TypeNode>;
  pos: number;
  end: number;
};

export type TypeUnion = {
  kind: "type_union";
  variants: Array<TypeNode>;
  pos: number;
  end: number;
};

export type TypeArrayShorthand = {
  kind: "type_array";
  elem: TypeNode;
  pos: number;
  end: number;
};

export type TypeLiteralNode = {
  kind: "type_literal";
  members: Array<TypeLiteralMember>;
  pos: number;
  end: number;
};

export type TypeLiteralMember = TypeLiteralField | TypeLiteralMethod;

export type TypeLiteralField = {
  kind: "type_lit_field";
  name: string;
  type: TypeNode;
  isReadonly: boolean;
  isOptional: boolean;
  pos: number;
  end: number;
};

export type TypeLiteralMethod = {
  kind: "type_lit_method";
  name: string;
  params: Array<TypeFnParam>;
  returnType: TypeNode;
  isOptional: boolean;
  pos: number;
  end: number;
};

export type TypeFn = {
  kind: "type_fn";
  params: Array<TypeFnParam>;
  returnType: TypeNode;
  pos: number;
  end: number;
};

export type TypeFnParam = {
  name: string;
  type: TypeNode;
  // Span of the whole parameter (name through type), used as the diagnostic
  // anchor for fn-type / method-signature parameter errors in codegen. Stripped
  // before parser-oracle comparison, so the topaz parser only needs to fill it.
  pos: number;
  end: number;
};

export type TypeStrLit = {
  kind: "type_str_lit";
  value: string;
  pos: number;
  end: number;
};

export type TypeNumLit = {
  kind: "type_num_lit";
  value: number;
  pos: number;
  end: number;
};

export type TypeVoid = {
  kind: "type_void";
  pos: number;
  end: number;
};

export type TypeUnknown = {
  kind: "type_unknown";
  pos: number;
  end: number;
};

// ============================================================
// Expressions
// ============================================================

export type Expr =
  | IdentExpr
  | NumLitExpr
  | BigIntLitExpr
  | StrLitExpr
  | BoolLitExpr
  | NullLitExpr
  | UndefinedLitExpr
  | ThisExpr
  | ImportMetaUrlExpr
  | TemplateLitExpr
  | ArrayLitExpr
  | ObjectLitExpr
  | ParenExpr
  | CallExpr
  | NewExpr
  | PropAccessExpr
  | ElemAccessExpr
  | PrefixOpExpr
  | PostfixOpExpr
  | BinOpExpr
  | InstanceofExpr
  | TypeofExpr
  | TernaryExpr
  | AssignExpr
  | ArrowExpr
  | NonNullExpr
  | SpreadExpr;

export type IdentExpr = { kind: "ident"; name: string; pos: number; end: number };
export type NumLitExpr = { kind: "num_lit"; text: string; value: number; pos: number; end: number };
export type BigIntLitExpr = { kind: "bigint_lit"; text: string; pos: number; end: number };
export type StrLitExpr = { kind: "str_lit"; value: string; pos: number; end: number };
export type BoolLitExpr = { kind: "bool_lit"; value: boolean; pos: number; end: number };
export type NullLitExpr = { kind: "null_lit"; pos: number; end: number };
export type UndefinedLitExpr = { kind: "undefined_lit"; pos: number; end: number };
export type ThisExpr = { kind: "this_expr"; pos: number; end: number };
// `import.meta.url` のみを表す leaf。codegen は他の MetaProperty 形
// (bare `import.meta` / 他 property / `new.target`) を全 reject するので
// 汎用 MetaProperty ノードは過剰。最小忠実表現として専用 leaf を持つ。
export type ImportMetaUrlExpr = { kind: "import_meta_url"; pos: number; end: number };

export type TemplateLitExpr = {
  kind: "template_lit";
  head: string;
  subs: Array<TemplateSub>;
  pos: number;
  end: number;
};

export type TemplateSub = {
  expr: Expr;
  cookedAfter: string;
};

export type ArrayElem =
  | { kind: "elem"; expr: Expr }
  | { kind: "spread"; expr: Expr };

export type ArrayLitExpr = {
  kind: "array_lit";
  elems: Array<ArrayElem>;
  pos: number;
  end: number;
};

export type ObjectMember = ObjectPropKV | ObjectPropShorthand | ObjectPropSpread;

export type ObjectPropKV = {
  kind: "prop_kv";
  name: string;
  value: Expr;
  pos: number;
  end: number;
};

export type ObjectPropShorthand = {
  kind: "prop_shorthand";
  name: string;
  pos: number;
  end: number;
};

export type ObjectPropSpread = {
  kind: "prop_spread";
  expr: Expr;
  pos: number;
  end: number;
};

export type ObjectLitExpr = {
  kind: "object_lit";
  props: Array<ObjectMember>;
  pos: number;
  end: number;
};

export type ParenExpr = { kind: "paren_expr"; inner: Expr; pos: number; end: number };

export type CallExpr = {
  kind: "call_expr";
  callee: Expr;
  typeArgs: Array<TypeNode>;
  args: Array<Expr>;
  optional: boolean;
  pos: number;
  end: number;
};

export type NewExpr = {
  kind: "new_expr";
  callee: Expr;
  typeArgs: Array<TypeNode>;
  args: Array<Expr>;
  pos: number;
  end: number;
};

export type PropAccessExpr = {
  kind: "prop_access";
  receiver: Expr;
  name: string;
  optional: boolean;
  pos: number;
  end: number;
};

export type ElemAccessExpr = {
  kind: "elem_access";
  receiver: Expr;
  index: Expr;
  optional: boolean;
  pos: number;
  end: number;
};

export type PrefixOpExpr = {
  kind: "prefix_op";
  op: string;
  operand: Expr;
  pos: number;
  end: number;
};

export type PostfixOpExpr = {
  kind: "postfix_op";
  op: string;
  operand: Expr;
  pos: number;
  end: number;
};

export type BinOpExpr = {
  kind: "bin_op";
  op: string;
  lhs: Expr;
  rhs: Expr;
  pos: number;
  end: number;
};

export type InstanceofExpr = {
  kind: "instanceof_expr";
  lhs: Expr;
  rhs: Expr;
  pos: number;
  end: number;
};

export type TypeofExpr = {
  kind: "typeof_expr";
  operand: Expr;
  pos: number;
  end: number;
};

export type TernaryExpr = {
  kind: "ternary_expr";
  cond: Expr;
  thenBranch: Expr;
  elseBranch: Expr;
  pos: number;
  end: number;
};

export type AssignExpr = {
  kind: "assign_expr";
  op: string;
  target: Expr;
  value: Expr;
  pos: number;
  end: number;
};

export type ArrowParam = {
  name: string;
  type: TypeNode | undefined;
  pos: number;
  end: number;
};

export type ArrowBody =
  | { kind: "arrow_expr_body"; expr: Expr }
  | { kind: "arrow_block_body"; stmts: Array<Stmt> };

export type ArrowExpr = {
  kind: "arrow_expr";
  params: Array<ArrowParam>;
  returnType: TypeNode | undefined;
  body: ArrowBody;
  pos: number;
  end: number;
};

export type NonNullExpr = {
  kind: "non_null";
  operand: Expr;
  pos: number;
  end: number;
};

export type SpreadExpr = {
  kind: "spread_expr";
  operand: Expr;
  pos: number;
  end: number;
};

// ============================================================
// Statements
// ============================================================

export type Stmt =
  | ExprStmt
  | VarDeclStmt
  | VarDestrDeclStmt
  | BlockStmt
  | IfStmt
  | WhileStmt
  | DoWhileStmt
  | ForStmt
  | ForOfStmt
  | SwitchStmt
  | TryStmt
  | ReturnStmt
  | BreakStmt
  | ContinueStmt
  | ThrowStmt
  | EmptyStmt;

export type ExprStmt = { kind: "expr_stmt"; expr: Expr; pos: number; end: number };

export type VarDeclStmt = {
  kind: "var_decl";
  declKind: string;
  name: string;
  type: TypeNode | undefined;
  init: Expr | undefined;
  pos: number;
  end: number;
};

export type VarDestrBinding = {
  name: string;
  pos: number;
  end: number;
};

export type VarDestrDeclStmt = {
  kind: "var_destr_decl";
  declKind: string;
  bindings: Array<VarDestrBinding>;
  init: Expr;
  pos: number;
  end: number;
};

export type BlockStmt = {
  kind: "block_stmt";
  stmts: Array<Stmt>;
  pos: number;
  end: number;
};

export type IfStmt = {
  kind: "if_stmt";
  cond: Expr;
  thenBranch: Stmt;
  elseBranch: Stmt | undefined;
  pos: number;
  end: number;
};

export type WhileStmt = {
  kind: "while_stmt";
  cond: Expr;
  body: Stmt;
  pos: number;
  end: number;
};

export type DoWhileStmt = {
  kind: "do_while_stmt";
  body: Stmt;
  cond: Expr;
  pos: number;
  end: number;
};

export type ForStmt = {
  kind: "for_stmt";
  init: ForInit | undefined;
  cond: Expr | undefined;
  update: Expr | undefined;
  body: Stmt;
  pos: number;
  end: number;
};

export type ForInit =
  | { kind: "for_init_decl"; decl: VarDeclStmt }
  | { kind: "for_init_expr"; expr: Expr };

export type ForOfBinding =
  | { kind: "for_of_single"; declKind: string; name: string; type: TypeNode | undefined }
  | { kind: "for_of_pair"; declKind: string; first: string; second: string };

export type ForOfStmt = {
  kind: "for_of_stmt";
  binding: ForOfBinding;
  source: Expr;
  body: Stmt;
  pos: number;
  end: number;
};

export type SwitchCase = {
  test: Expr | undefined;
  stmts: Array<Stmt>;
  pos: number;
  end: number;
};

export type SwitchStmt = {
  kind: "switch_stmt";
  discriminant: Expr;
  cases: Array<SwitchCase>;
  pos: number;
  end: number;
};

export type TryStmt = {
  kind: "try_stmt";
  tryBlock: BlockStmt;
  catchClause: CatchClause | undefined;
  finallyBlock: BlockStmt | undefined;
  pos: number;
  end: number;
};

export type CatchClause = {
  bindingName: string | undefined;
  bindingType: TypeNode | undefined;
  body: BlockStmt;
  pos: number;
  end: number;
};

export type ReturnStmt = {
  kind: "return_stmt";
  value: Expr | undefined;
  pos: number;
  end: number;
};

export type BreakStmt = { kind: "break_stmt"; pos: number; end: number };
export type ContinueStmt = { kind: "continue_stmt"; pos: number; end: number };

export type ThrowStmt = {
  kind: "throw_stmt";
  value: Expr;
  pos: number;
  end: number;
};

export type EmptyStmt = { kind: "empty_stmt"; pos: number; end: number };

// ============================================================
// Declarations
// ============================================================

export type Decl =
  | FunctionDecl
  | ClassDecl
  | InterfaceDecl
  | TypeAliasDecl
  | ImportDecl;

export type FunctionParam = {
  name: string;
  type: TypeNode;
  isOptional: boolean;
  pos: number;
  end: number;
};

export type TypeParam = {
  name: string;
  pos: number;
  end: number;
};

export type FunctionDecl = {
  kind: "function_decl";
  isExported: boolean;
  name: string;
  typeParams: Array<TypeParam>;
  params: Array<FunctionParam>;
  returnType: TypeNode | undefined;
  body: BlockStmt;
  pos: number;
  end: number;
};

export type ClassMemberModifier = string;

export type ClassFieldMember = {
  kind: "class_field";
  modifiers: Array<ClassMemberModifier>;
  name: string;
  type: TypeNode;
  initializer: Expr | undefined;
  pos: number;
  end: number;
};

export type ClassMethodMember = {
  kind: "class_method";
  modifiers: Array<ClassMemberModifier>;
  isCtor: boolean;
  name: string;
  params: Array<FunctionParam>;
  returnType: TypeNode | undefined;
  body: BlockStmt;
  pos: number;
  end: number;
};

export type ClassMember = ClassFieldMember | ClassMethodMember;

export type ClassDecl = {
  kind: "class_decl";
  isExported: boolean;
  name: string;
  typeParams: Array<TypeParam>;
  implementsList: Array<string>;
  members: Array<ClassMember>;
  pos: number;
  end: number;
};

export type InterfaceFieldMember = {
  kind: "interface_field";
  isReadonly: boolean;
  name: string;
  type: TypeNode;
  pos: number;
  end: number;
};

export type InterfaceMethodMember = {
  kind: "interface_method";
  name: string;
  params: Array<FunctionParam>;
  returnType: TypeNode;
  pos: number;
  end: number;
};

export type InterfaceMember = InterfaceFieldMember | InterfaceMethodMember;

export type InterfaceDecl = {
  kind: "interface_decl";
  isExported: boolean;
  name: string;
  members: Array<InterfaceMember>;
  pos: number;
  end: number;
};

export type TypeAliasDecl = {
  kind: "type_alias_decl";
  isExported: boolean;
  name: string;
  typeParams: Array<TypeParam>;
  body: TypeNode;
  pos: number;
  end: number;
};

export type ImportSpecifier = {
  importedName: string;
  localName: string;
  isTypeOnly: boolean;
  pos: number;
  end: number;
};

export type ImportDecl = {
  kind: "import_decl";
  specifiers: Array<ImportSpecifier>;
  modulePath: string;
  modulePathPos: number;
  modulePathEnd: number;
  isTypeOnly: boolean;
  defaultName: string | undefined;
  defaultNamePos: number;
  namespaceName: string | undefined;
  namespaceNamePos: number;
  pos: number;
  end: number;
};

// ============================================================
// Module
// ============================================================

export type ModuleItem =
  | { kind: "module_decl"; decl: Decl }
  | { kind: "module_stmt"; stmt: Stmt };

export type SourceModule = {
  filePath: string;
  // lineStarts[i] = byte offset of the start of line i (0-based), mirroring
  // ts.SourceFile.getLineStarts(). Required: codegen's posToLineCol uses it to
  // render `file:line:col` diagnostics without a tsc dependency. Stripped before
  // parser-oracle comparison (position metadata, not semantic AST).
  lineStarts: Array<number>;
  items: Array<ModuleItem>;
};
