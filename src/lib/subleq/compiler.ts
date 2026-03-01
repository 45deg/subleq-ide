// ============================================================
// Subleq Compiler — AST → Macro IR
// Generates macro-level instructions that expand to SUBLEQ
// ============================================================
import {
  type ProgramNode, type FunctionDecl, type VarDecl, type ArrayDecl,
  type Statement, type Expression, type BlockStmt,
  type MacroInstr, type CompileError,
} from "./types";

/**
 * Macro instruction set (each expands to SUBLEQ sequences):
 *
 *  CLR  X          — X = 0
 *  MOV  X, Y       — X = Y
 *  ADD  X, Y       — X = X + Y
 *  SUB  X, Y       — X = X - Y
 *  MUL  X, Y       — X = X * Y (loop-based)
 *  DIV  X, Y       — X = X / Y (loop-based)
 *  MOD  X, Y       — X = X % Y (loop-based)
 *  NEG  X          — X = -X
 *  SET  X, imm     — X = immediate value
 *  JMP  L          — unconditional jump
 *  JLE  X, L       — jump if X <= 0
 *  JEQ  X, Y, L    — jump if X == Y
 *  JNE  X, Y, L    — jump if X != Y
 *  JLT  X, Y, L    — jump if X < Y
 *  JGT  X, Y, L    — jump if X > Y
 *  JLTE X, Y, L    — jump if X <= Y
 *  JGTE X, Y, L    — jump if X >= Y
 *  PUTC X          — output mem[X] as char (trap -2)
 *  PUTN X          — output mem[X] as number (trap -4)
 *  CALL F          — call function
 *  RET             — return
 *  PUSH X          — push to stack
 *  POP  X          — pop from stack
 *  LABEL L         — define label
 *  DATA  name val  — define data word
 *  ARRAY name sz   — define array
 *  HALT            — halt execution
 */

export class Compiler {
  private macros: MacroInstr[] = [];
  public errors: CompileError[] = [];
  private tempCount: number = 0;
  private labelCount: number = 0;
  private currentFunction: string = "";
  private breakLabels: string[] = [];
  private continueLabels: string[] = [];
  private globals: Map<string, { type: string; isArray: boolean; size: number }> = new Map();
  private localScopes: Map<string, string>[] = []; // maps source name -> unique name
  private stringLiterals: Map<string, string> = new Map(); // string -> label

  compile(program: ProgramNode): { macros: MacroInstr[]; errors: CompileError[] } {
    this.macros = [];
    this.errors = [];
    this.tempCount = 0;
    this.labelCount = 0;
    this.globals = new Map();
    this.stringLiterals = new Map();

    // First pass: collect globals
    for (const decl of program.declarations) {
      if (decl.kind === "VarDecl") {
        this.globals.set(decl.name, { type: decl.type, isArray: false, size: 1 });
      } else if (decl.kind === "ArrayDecl") {
        this.globals.set(decl.name, { type: decl.type, isArray: true, size: decl.size });
      }
    }

    // Emit jump to main
    this.emit("JMP", ["__main_start"], "jump to main");

    // Second pass: emit code
    for (const decl of program.declarations) {
      if (decl.kind === "FunctionDecl") {
        this.compileFunction(decl);
      }
    }

    // main entry point
    this.emit("LABEL", ["__main_start"]);

    // Initialize global variables
    for (const decl of program.declarations) {
      if (decl.kind === "VarDecl") {
        if (decl.init) {
          const val = this.compileExpr(decl.init);
          this.emit("MOV", [`_g_${decl.name}`, val], `init global ${decl.name}`);
          this.freeTemp(val);
        }
      } else if (decl.kind === "ArrayDecl") {
        if (decl.init) {
          for (let i = 0; i < decl.init.length; i++) {
            const val = this.compileExpr(decl.init[i]);
            const idx = this.newTemp();
            this.emit("SET", [idx, String(i)]);
            this.emit("ADD", [idx, `_g_${decl.name}_base`]);
            // Store val at computed address — use special STORE macro
            this.emit("STORE", [idx, val], `${decl.name}[${i}] = ...`);
            this.freeTemp(idx);
            this.freeTemp(val);
          }
        }
      }
    }

    // Call main if exists
    const hasMain = program.declarations.some(d => d.kind === "FunctionDecl" && d.name === "main");
    if (hasMain) {
      this.emit("CALL", ["_fn_main"], "call main");
    }

    this.emit("HALT", [], "program end");

    // Emit global data
    for (const decl of program.declarations) {
      if (decl.kind === "VarDecl") {
        this.emit("DATA", [`_g_${decl.name}`, "0"], `global ${decl.name}`);
      } else if (decl.kind === "ArrayDecl") {
        this.emit("ARRAY", [`_g_${decl.name}_base`, String(decl.size)], `global array ${decl.name}`);
      }
    }

    // Emit string literals
    for (const [str, label] of this.stringLiterals.entries()) {
      const codes = [];
      for (let i = 0; i < str.length; i++) {
        codes.push(String(str.charCodeAt(i)));
      }
      codes.push("0"); // null terminator
      this.emit("STRDATA", [label, ...codes], `string: "${str.replace(/\n/g, "\\n")}"`);
    }

    // Emit temp storage
    for (let i = 0; i < this.tempCount + 10; i++) {
      this.emit("DATA", [`_t${i}`, "0"], `temp ${i}`);
    }

    // Emit internal constants and helpers
    this.emit("DATA", ["_zero", "0"], "constant 0");
    this.emit("DATA", ["_one", "1"], "constant 1");
    this.emit("DATA", ["_neg1", "-1"], "constant -1");
    this.emit("DATA", ["_tmp_a", "0"], "scratch a");
    this.emit("DATA", ["_tmp_b", "0"], "scratch b");
    this.emit("DATA", ["_tmp_c", "0"], "scratch c");
    this.emit("DATA", ["_tmp_d", "0"], "scratch d");
    this.emit("DATA", ["_tmp_sign", "0"], "scratch sign");
    this.emit("DATA", ["_ret_val", "0"], "return value");

    return { macros: this.macros, errors: this.errors };
  }

  private emit(op: string, args: string[], comment?: string): void {
    this.macros.push({ op, args, comment });
  }

  private newTemp(): string {
    const name = `_t${this.tempCount}`;
    this.tempCount++;
    return name;
  }

  private maxTemp: number = 0;
  private freeTemp(_name: string): void {
    // In this simple model, we track max temp usage
    if (this.tempCount > this.maxTemp) this.maxTemp = this.tempCount;
  }

  private newLabel(prefix: string = "L"): string {
    return `_${prefix}_${this.labelCount++}`;
  }

  private resolveVar(name: string): string {
    // Check local scopes (innermost first)
    for (let i = this.localScopes.length - 1; i >= 0; i--) {
      const mapped = this.localScopes[i].get(name);
      if (mapped) return mapped;
    }
    // Global
    if (this.globals.has(name)) {
      const info = this.globals.get(name)!;
      if (info.isArray) return `_g_${name}_base`;
      return `_g_${name}`;
    }
    return `_g_${name}`; // assume global
  }

  private pushScope(): void {
    this.localScopes.push(new Map());
  }

  private popScope(): void {
    this.localScopes.pop();
  }

  private declareLocal(name: string): string {
    const unique = `_l_${this.currentFunction}_${name}_${this.labelCount++}`;
    if (this.localScopes.length > 0) {
      this.localScopes[this.localScopes.length - 1].set(name, unique);
    }
    this.emit("DATA", [unique, "0"], `local ${name}`);
    return unique;
  }

  // ---- Functions ----
  private compileFunction(fn: FunctionDecl): void {
    this.currentFunction = fn.name;
    this.pushScope();

    this.emit("LABEL", [`_fn_${fn.name}`], `function ${fn.name}`);

    // Declare params as locals
    for (const p of fn.params) {
      const local = this.declareLocal(p.name);
      // Params will be set via caller before CALL — use param slots
      this.emit("MOV", [local, `_param_${fn.name}_${p.name}`], `param ${p.name}`);
    }

    // Compile body
    this.compileBlock(fn.body);

    // Implicit return
    this.emit("RET", [], `end of ${fn.name}`);

    this.popScope();

    // Emit param storage
    for (const p of fn.params) {
      this.emit("DATA", [`_param_${fn.name}_${p.name}`, "0"], `param slot ${p.name}`);
    }
  }

  // ---- Statements ----
  private compileBlock(block: BlockStmt): void {
    this.pushScope();
    for (const stmt of block.stmts) {
      this.compileStmt(stmt);
    }
    this.popScope();
  }

  private compileStmt(stmt: Statement): void {
    switch (stmt.kind) {
      case "Block": return this.compileBlock(stmt);
      case "VarDecl": return this.compileVarDecl(stmt);
      case "ArrayDecl": return this.compileLocalArrayDecl(stmt);
      case "If": return this.compileIf(stmt);
      case "While": return this.compileWhile(stmt);
      case "For": return this.compileFor(stmt);
      case "Return": return this.compileReturn(stmt);
      case "Break": return this.compileBreak(stmt);
      case "Continue": return this.compileContinue(stmt);
      case "ExprStmt": {
        const val = this.compileExpr(stmt.expr);
        this.freeTemp(val);
        break;
      }
    }
  }

  private compileVarDecl(decl: VarDecl): void {
    const local = this.declareLocal(decl.name);
    if (decl.init) {
      const val = this.compileExpr(decl.init);
      this.emit("MOV", [local, val], `${decl.name} = ...`);
      this.freeTemp(val);
    }
  }

  private compileLocalArrayDecl(decl: ArrayDecl): void {
    const label = `_l_${this.currentFunction}_${decl.name}_arr_${this.labelCount++}`;
    if (this.localScopes.length > 0) {
      this.localScopes[this.localScopes.length - 1].set(decl.name, label);
    }
    this.emit("ARRAY", [label, String(decl.size)], `local array ${decl.name}`);

    if (decl.init) {
      for (let i = 0; i < decl.init.length; i++) {
        const val = this.compileExpr(decl.init[i]);
        const idx = this.newTemp();
        this.emit("SET", [idx, String(i)]);
        this.emit("ADD", [idx, label]);
        this.emit("STORE", [idx, val]);
        this.freeTemp(idx);
        this.freeTemp(val);
      }
    }
  }

  private compileIf(stmt: import("./types").IfStmt): void {
    const labelElse = this.newLabel("else");
    const labelEnd = this.newLabel("endif");

    const cond = this.compileExpr(stmt.cond);
    this.emit("JLE", [cond, labelElse], "if condition");
    this.freeTemp(cond);

    this.compileStmt(stmt.then);
    if (stmt.else_) {
      this.emit("JMP", [labelEnd]);
    }

    this.emit("LABEL", [labelElse]);

    if (stmt.else_) {
      this.compileStmt(stmt.else_);
      this.emit("LABEL", [labelEnd]);
    }
  }

  private compileWhile(stmt: import("./types").WhileStmt): void {
    const labelTop = this.newLabel("while");
    const labelEnd = this.newLabel("endwhile");

    this.breakLabels.push(labelEnd);
    this.continueLabels.push(labelTop);

    this.emit("LABEL", [labelTop]);
    const cond = this.compileExpr(stmt.cond);
    this.emit("JLE", [cond, labelEnd], "while condition");
    this.freeTemp(cond);

    this.compileStmt(stmt.body);
    this.emit("JMP", [labelTop]);
    this.emit("LABEL", [labelEnd]);

    this.breakLabels.pop();
    this.continueLabels.pop();
  }

  private compileFor(stmt: import("./types").ForStmt): void {
    const labelTop = this.newLabel("for");
    const labelUpdate = this.newLabel("for_upd");
    const labelEnd = this.newLabel("endfor");

    this.breakLabels.push(labelEnd);
    this.continueLabels.push(labelUpdate);

    if (stmt.init) {
      this.compileStmt(stmt.init);
    }

    this.emit("LABEL", [labelTop]);

    if (stmt.cond) {
      const cond = this.compileExpr(stmt.cond);
      this.emit("JLE", [cond, labelEnd], "for condition");
      this.freeTemp(cond);
    }

    this.compileStmt(stmt.body);

    this.emit("LABEL", [labelUpdate]);
    if (stmt.update) {
      const v = this.compileExpr(stmt.update);
      this.freeTemp(v);
    }
    this.emit("JMP", [labelTop]);
    this.emit("LABEL", [labelEnd]);

    this.breakLabels.pop();
    this.continueLabels.pop();
  }

  private compileReturn(stmt: import("./types").ReturnStmt): void {
    if (stmt.value) {
      const val = this.compileExpr(stmt.value);
      this.emit("MOV", ["_ret_val", val], "return value");
      this.freeTemp(val);
    }
    this.emit("RET", []);
  }

  private compileBreak(_stmt: import("./types").BreakStmt): void {
    if (this.breakLabels.length > 0) {
      this.emit("JMP", [this.breakLabels[this.breakLabels.length - 1]]);
    }
  }

  private compileContinue(_stmt: import("./types").ContinueStmt): void {
    if (this.continueLabels.length > 0) {
      this.emit("JMP", [this.continueLabels[this.continueLabels.length - 1]]);
    }
  }

  // ---- Expressions ----
  // Returns the name of the location holding the result
  private compileExpr(expr: Expression): string {
    switch (expr.kind) {
      case "IntLiteral": {
        const tmp = this.newTemp();
        this.emit("SET", [tmp, String(expr.value)]);
        return tmp;
      }

      case "CharLiteral": {
        const tmp = this.newTemp();
        this.emit("SET", [tmp, String(expr.value)]);
        return tmp;
      }

      case "StringLiteral": {
        // Store string data and return pointer to it
        let label = this.stringLiterals.get(expr.value);
        if (!label) {
          label = this.newLabel("str");
          this.stringLiterals.set(expr.value, label);
        }
        const tmp = this.newTemp();
        this.emit("LEA", [tmp, label], `addr of string`);
        return tmp;
      }

      case "VarRef": {
        const loc = this.resolveVar(expr.name);
        const tmp = this.newTemp();
        this.emit("MOV", [tmp, loc], `load ${expr.name}`);
        return tmp;
      }

      case "ArrayAccess": {
        const base = this.resolveVar(expr.array);
        const idx = this.compileExpr(expr.index);
        const addr = this.newTemp();
        this.emit("LEA", [addr, base]);
        this.emit("ADD", [addr, idx]);
        const result = this.newTemp();
        this.emit("LOAD", [result, addr], `${expr.array}[...]`);
        this.freeTemp(idx);
        this.freeTemp(addr);
        return result;
      }

      case "Assign": {
        const val = this.compileExpr(expr.value);
        if (expr.target.kind === "VarRef") {
          const loc = this.resolveVar(expr.target.name);
          if (expr.op === "=") {
            this.emit("MOV", [loc, val], `${expr.target.name} = ...`);
          } else if (expr.op === "+=") {
            this.emit("ADD", [loc, val], `${expr.target.name} += ...`);
          } else if (expr.op === "-=") {
            this.emit("SUB", [loc, val], `${expr.target.name} -= ...`);
          }
        } else if (expr.target.kind === "ArrayAccess") {
          const base = this.resolveVar(expr.target.array);
          const idx = this.compileExpr(expr.target.index);
          const addr = this.newTemp();
          this.emit("LEA", [addr, base]);
          this.emit("ADD", [addr, idx]);

          if (expr.op === "+=") {
            const cur = this.newTemp();
            this.emit("LOAD", [cur, addr]);
            this.emit("ADD", [cur, val]);
            this.emit("STORE", [addr, cur]);
            this.freeTemp(cur);
          } else if (expr.op === "-=") {
            const cur = this.newTemp();
            this.emit("LOAD", [cur, addr]);
            this.emit("SUB", [cur, val]);
            this.emit("STORE", [addr, cur]);
            this.freeTemp(cur);
          } else {
            this.emit("STORE", [addr, val], `${expr.target.array}[...] = ...`);
          }
          this.freeTemp(idx);
          this.freeTemp(addr);
        }
        return val;
      }

      case "Binary": {
        return this.compileBinaryExpr(expr);
      }

      case "Unary": {
        return this.compileUnaryExpr(expr);
      }

      case "Call": {
        return this.compileCall(expr);
      }

      default:
        this.errors.push({
          line: 0, col: 0,
          message: `Unsupported expression: ${(expr as Expression).kind}`,
          phase: "compiler",
        });
        return "_zero";
    }
  }

  private compileBinaryExpr(expr: import("./types").BinaryExpr): string {
    const left = this.compileExpr(expr.left);
    const right = this.compileExpr(expr.right);
    const result = this.newTemp();

    switch (expr.op) {
      case "+":
        this.emit("MOV", [result, left]);
        this.emit("ADD", [result, right]);
        break;
      case "-":
        this.emit("MOV", [result, left]);
        this.emit("SUB", [result, right]);
        break;
      case "*":
        this.emit("MOV", [result, left]);
        this.emit("MUL", [result, right]);
        break;
      case "/":
        this.emit("MOV", [result, left]);
        this.emit("DIV", [result, right]);
        break;
      case "%":
        this.emit("MOV", [result, left]);
        this.emit("MOD", [result, right]);
        break;
      case "==": {
        const lbl_true = this.newLabel("eq_t");
        const lbl_end = this.newLabel("eq_e");
        this.emit("SET", [result, "0"]);
        this.emit("JEQ", [left, right, lbl_true]);
        this.emit("JMP", [lbl_end]);
        this.emit("LABEL", [lbl_true]);
        this.emit("SET", [result, "1"]);
        this.emit("LABEL", [lbl_end]);
        break;
      }
      case "!=": {
        const lbl_true = this.newLabel("ne_t");
        const lbl_end = this.newLabel("ne_e");
        this.emit("SET", [result, "0"]);
        this.emit("JNE", [left, right, lbl_true]);
        this.emit("JMP", [lbl_end]);
        this.emit("LABEL", [lbl_true]);
        this.emit("SET", [result, "1"]);
        this.emit("LABEL", [lbl_end]);
        break;
      }
      case "<": {
        const lbl_true = this.newLabel("lt_t");
        const lbl_end = this.newLabel("lt_e");
        this.emit("SET", [result, "0"]);
        this.emit("JLT", [left, right, lbl_true]);
        this.emit("JMP", [lbl_end]);
        this.emit("LABEL", [lbl_true]);
        this.emit("SET", [result, "1"]);
        this.emit("LABEL", [lbl_end]);
        break;
      }
      case ">": {
        const lbl_true = this.newLabel("gt_t");
        const lbl_end = this.newLabel("gt_e");
        this.emit("SET", [result, "0"]);
        this.emit("JGT", [left, right, lbl_true]);
        this.emit("JMP", [lbl_end]);
        this.emit("LABEL", [lbl_true]);
        this.emit("SET", [result, "1"]);
        this.emit("LABEL", [lbl_end]);
        break;
      }
      case "<=": {
        const lbl_true = this.newLabel("le_t");
        const lbl_end = this.newLabel("le_e");
        this.emit("SET", [result, "0"]);
        this.emit("JLTE", [left, right, lbl_true]);
        this.emit("JMP", [lbl_end]);
        this.emit("LABEL", [lbl_true]);
        this.emit("SET", [result, "1"]);
        this.emit("LABEL", [lbl_end]);
        break;
      }
      case ">=": {
        const lbl_true = this.newLabel("ge_t");
        const lbl_end = this.newLabel("ge_e");
        this.emit("SET", [result, "0"]);
        this.emit("JGTE", [left, right, lbl_true]);
        this.emit("JMP", [lbl_end]);
        this.emit("LABEL", [lbl_true]);
        this.emit("SET", [result, "1"]);
        this.emit("LABEL", [lbl_end]);
        break;
      }
      case "&&": {
        const lbl_false = this.newLabel("and_f");
        const lbl_end = this.newLabel("and_e");
        this.emit("SET", [result, "0"]);
        this.emit("JLE", [left, lbl_false]);
        this.emit("JLE", [right, lbl_false]);
        this.emit("SET", [result, "1"]);
        this.emit("JMP", [lbl_end]);
        this.emit("LABEL", [lbl_false]);
        this.emit("LABEL", [lbl_end]);
        break;
      }
      case "||": {
        const lbl_true = this.newLabel("or_t");
        const lbl_end = this.newLabel("or_e");
        this.emit("SET", [result, "0"]);
        // if left > 0, true
        const negLeft = this.newTemp();
        this.emit("MOV", [negLeft, left]);
        this.emit("NEG", [negLeft]);
        this.emit("JLE", [negLeft, lbl_true]); // left > 0 => -left <= 0
        this.freeTemp(negLeft);
        const negRight = this.newTemp();
        this.emit("MOV", [negRight, right]);
        this.emit("NEG", [negRight]);
        this.emit("JLE", [negRight, lbl_true]); // right > 0 => -right <= 0
        this.freeTemp(negRight);
        this.emit("JMP", [lbl_end]);
        this.emit("LABEL", [lbl_true]);
        this.emit("SET", [result, "1"]);
        this.emit("LABEL", [lbl_end]);
        break;
      }
    }

    this.freeTemp(left);
    this.freeTemp(right);
    return result;
  }

  private compileUnaryExpr(expr: import("./types").UnaryExpr): string {
    if (expr.op === "-") {
      const operand = this.compileExpr(expr.operand);
      this.emit("NEG", [operand]);
      return operand;
    }

    if (expr.op === "!") {
      const operand = this.compileExpr(expr.operand);
      const result = this.newTemp();
      const lbl_true = this.newLabel("not_t");
      const lbl_end = this.newLabel("not_e");
      this.emit("SET", [result, "1"]);
      this.emit("JLE", [operand, lbl_true]); // operand <= 0 means !operand = 1 (but need == 0 check)
      this.emit("SET", [result, "0"]);
      this.emit("JMP", [lbl_end]);
      this.emit("LABEL", [lbl_true]);
      // operand <= 0: need to check if exactly 0
      const lbl_neg = this.newLabel("not_neg");
      const negOp = this.newTemp();
      this.emit("MOV", [negOp, operand]);
      this.emit("NEG", [negOp]);
      this.emit("JLE", [negOp, lbl_neg]); // -operand <= 0 means operand >= 0, combined with operand <= 0 => operand == 0
      // operand < 0 (negOp > 0)
      this.emit("SET", [result, "0"]);
      this.emit("JMP", [lbl_end]);
      this.emit("LABEL", [lbl_neg]);
      this.emit("SET", [result, "1"]);
      this.emit("LABEL", [lbl_end]);
      this.freeTemp(negOp);
      this.freeTemp(operand);
      return result;
    }

    if (expr.op === "++" || expr.op === "--") {
      if (expr.operand.kind === "VarRef") {
        const loc = this.resolveVar(expr.operand.name);
        const tmp = this.newTemp();
        if (expr.prefix) {
          if (expr.op === "++") {
            this.emit("SET", [tmp, "1"]);
            this.emit("ADD", [loc, tmp]);
          } else {
            this.emit("SET", [tmp, "1"]);
            this.emit("SUB", [loc, tmp]);
          }
          this.emit("MOV", [tmp, loc]);
        } else {
          this.emit("MOV", [tmp, loc]); // save old value
          const one = this.newTemp();
          this.emit("SET", [one, "1"]);
          if (expr.op === "++") {
            this.emit("ADD", [loc, one]);
          } else {
            this.emit("SUB", [loc, one]);
          }
          this.freeTemp(one);
        }
        return tmp;
      }
    }

    this.errors.push({
      line: expr.line, col: 0,
      message: `Unsupported unary operator: ${expr.op}`,
      phase: "compiler",
    });
    return "_zero";
  }

  private compileCall(expr: import("./types").CallExpr): string {
    const result = this.newTemp();

    // Built-in calls
    if (expr.callee === "putc") {
      if (expr.args.length >= 1) {
        const arg = this.compileExpr(expr.args[0]);
        this.emit("PUTC", [arg], "putc");
        this.freeTemp(arg);
      }
      this.emit("SET", [result, "0"]);
      return result;
    }

    if (expr.callee === "print") {
      if (expr.args.length >= 1) {
        const arg = this.compileExpr(expr.args[0]);
        this.emit("PUTN", [arg], "print number");
        this.freeTemp(arg);
      }
      this.emit("SET", [result, "0"]);
      return result;
    }

    if (expr.callee === "getc") {
      this.emit("GETC", [result], "getc");
      return result;
    }

    // User-defined function call
    // Set param slots
    // Look up function params — we need to find the FunctionDecl
    // For simplicity, we emit param setting based on arg position
    for (let i = 0; i < expr.args.length; i++) {
      const arg = this.compileExpr(expr.args[i]);
      this.emit("MOV", [`_param_${expr.callee}_arg${i}`, arg], `arg ${i}`);
      this.freeTemp(arg);
    }

    this.emit("CALL", [`_fn_${expr.callee}`], `call ${expr.callee}`);
    this.emit("MOV", [result, "_ret_val"]);
    return result;
  }
}
