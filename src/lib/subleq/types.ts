// ============================================================
// Subleq Compiler & VM — Core Type Definitions (32-bit)
// ============================================================

// ---- Memory Layout (32-bit words) ----
// 0x0000_0000 .. 0x0000_00FF  : Reserved / Trap vectors
//   Address -1 (0xFFFFFFFF)   : HALT trap
//   Address -2 (0xFFFFFFFE)   : PUTC trap  — mem[A] is char to output
//   Address -3 (0xFFFFFFFD)   : GETC trap  — result stored in mem[A]
//   Address -4 (0xFFFFFFFC)   : PUTN trap  — mem[A] is int to print
//   Address -5 (0xFFFFFFFB)   : GETN trap  — read decimal int into mem[A]
// 0x0000_0100 .. 0x0000_03FF  : Code segment start
// Stack grows downward from top of memory

export const WORD_SIZE = 4; // 32-bit = 4 bytes
export const WORD_BITS = 32;
export const WORD_MAX = 0x7FFFFFFF;   // max positive i32
export const WORD_MIN = -0x80000000;  // min negative i32
export const MEMORY_SIZE = 65536;     // 64K words (256KB)

// Negative address traps (interpreted as i32)
export const TRAP_HALT = -1;   // 0xFFFFFFFF
export const TRAP_PUTC = -2;   // 0xFFFFFFFE — putc: output mem[A] as char
export const TRAP_GETC = -3;   // 0xFFFFFFFD — getc: read char into mem[A]
export const TRAP_PUTN = -4;   // 0xFFFFFFFC — putn: output mem[A] as number
export const TRAP_GETN = -5;   // 0xFFFFFFFB — getn: read decimal int into mem[A]

// Code segment starts after reserved area
export const CODE_START = 0x0100; // 256

// ---- AST Node Types ----
export type ASTNode =
  | ProgramNode
  | FunctionDecl
  | VarDecl
  | ArrayDecl
  | BlockStmt
  | IfStmt
  | WhileStmt
  | ForStmt
  | ReturnStmt
  | BreakStmt
  | ContinueStmt
  | ExprStmt
  | AssignExpr
  | BinaryExpr
  | UnaryExpr
  | CallExpr
  | VarRef
  | ArrayAccess
  | IntLiteralExpr
  | CharLiteralExpr
  | StringLiteralExpr;

export interface ProgramNode {
  kind: "Program";
  declarations: (FunctionDecl | VarDecl | ArrayDecl | Statement)[];
}

export interface FunctionDecl {
  kind: "FunctionDecl";
  returnType: string;
  name: string;
  params: { type: string; name: string }[];
  body: BlockStmt;
  line: number;
}

export interface VarDecl {
  kind: "VarDecl";
  type: string;
  name: string;
  init?: Expression;
  line: number;
}

export interface ArrayDecl {
  kind: "ArrayDecl";
  type: string;
  name: string;
  size: number;
  init?: Expression[];
  line: number;
}

export interface BlockStmt {
  kind: "Block";
  stmts: Statement[];
}

export interface IfStmt {
  kind: "If";
  cond: Expression;
  then: Statement;
  else_?: Statement;
  line: number;
}

export interface WhileStmt {
  kind: "While";
  cond: Expression;
  body: Statement;
  line: number;
}

export interface ForStmt {
  kind: "For";
  init?: Statement;
  cond?: Expression;
  update?: Expression;
  body: Statement;
  line: number;
}

export interface ReturnStmt {
  kind: "Return";
  value?: Expression;
  line: number;
}

export interface BreakStmt {
  kind: "Break";
  line: number;
}

export interface ContinueStmt {
  kind: "Continue";
  line: number;
}

export interface ExprStmt {
  kind: "ExprStmt";
  expr: Expression;
}

export interface AssignExpr {
  kind: "Assign";
  op: "=" | "+=" | "-=";
  target: VarRef | ArrayAccess;
  value: Expression;
  line: number;
}

export interface BinaryExpr {
  kind: "Binary";
  op: string;
  left: Expression;
  right: Expression;
  line: number;
}

export interface UnaryExpr {
  kind: "Unary";
  op: string;
  operand: Expression;
  prefix: boolean;
  line: number;
}

export interface CallExpr {
  kind: "Call";
  callee: string;
  args: Expression[];
  line: number;
}

export interface VarRef {
  kind: "VarRef";
  name: string;
  line: number;
}

export interface ArrayAccess {
  kind: "ArrayAccess";
  array: string;
  index: Expression;
  line: number;
}

export interface IntLiteralExpr {
  kind: "IntLiteral";
  value: number;
  line: number;
}

export interface CharLiteralExpr {
  kind: "CharLiteral";
  value: number; // char code
  line: number;
}

export interface StringLiteralExpr {
  kind: "StringLiteral";
  value: string;
  line: number;
}

export type Expression =
  | AssignExpr
  | BinaryExpr
  | UnaryExpr
  | CallExpr
  | VarRef
  | ArrayAccess
  | IntLiteralExpr
  | CharLiteralExpr
  | StringLiteralExpr;

export type Statement =
  | VarDecl
  | ArrayDecl
  | BlockStmt
  | IfStmt
  | WhileStmt
  | ForStmt
  | ReturnStmt
  | BreakStmt
  | ContinueStmt
  | ExprStmt;

// ---- Macro IR (intermediate representation) ----
export interface MacroInstr {
  op: string;
  args: string[];
  comment?: string;
}

// ---- Assembled instruction ----
export interface SubleqInstr {
  a: number | string;
  b: number | string;
  c: number | string;
  comment?: string;
  address?: number;
}

// ---- VM State ----
export interface VMState {
  memory: Int32Array;
  pc: number;
  halted: boolean;
  output: string;
  inputBuffer: string;
  inputPos: number;
  cycleCount: number;
  memorySize: number;
}

// ---- Compilation Result ----
export interface CompilationResult {
  success: boolean;
  errors: CompileError[];
  ast?: ProgramNode;
  macroCode?: MacroInstr[];
  assembly?: SubleqInstr[];
  binary?: Int32Array;
  labels?: Map<string, number>;
  macroText?: string;
  assemblyText?: string;
}

export interface CompileError {
  line: number;
  col: number;
  message: string;
  phase: "lexer" | "parser" | "compiler" | "assembler";
}

// ---- Demo Programs ----
export interface DemoProgram {
  name: string;
  description?: string;
  source: string;
}
