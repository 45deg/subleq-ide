// ============================================================
// Subleq Compiler — PEG Grammar (C-like language → AST)
// ============================================================

{{
// --- AST Node constructors ---

function program(declarations) {
  return { kind: "Program", declarations };
}

function functionDecl(returnType, name, params, body, line) {
  return { kind: "FunctionDecl", returnType, name, params, body, line };
}

function varDecl(type, name, init, line) {
  return { kind: "VarDecl", type, name, init, line };
}

function arrayDecl(type, name, size, init, line) {
  return { kind: "ArrayDecl", type, name, size, init, line };
}

function blockStmt(stmts) {
  return { kind: "Block", stmts };
}

function ifStmt(cond, then, else_, line) {
  return { kind: "If", cond, then, else_: else_ ?? undefined, line };
}

function whileStmt(cond, body, line) {
  return { kind: "While", cond, body, line };
}

function forStmt(init, cond, update, body, line) {
  return { kind: "For", init: init ?? undefined, cond: cond ?? undefined, update: update ?? undefined, body, line };
}

function returnStmt(value, line) {
  return { kind: "Return", value: value ?? undefined, line };
}

function breakStmt(line) {
  return { kind: "Break", line };
}

function continueStmt(line) {
  return { kind: "Continue", line };
}

function exprStmt(expr) {
  return { kind: "ExprStmt", expr };
}

function assignExpr(op, target, value, line) {
  return { kind: "Assign", op, target, value, line };
}

function binaryExpr(op, left, right, line) {
  return { kind: "Binary", op, left, right, line };
}

function unaryExpr(op, operand, prefix, line) {
  return { kind: "Unary", op, operand, prefix, line };
}

function callExpr(callee, args, line) {
  return { kind: "Call", callee, args, line };
}

function varRef(name, line) {
  return { kind: "VarRef", name, line };
}

function arrayAccess(array, index, line) {
  return { kind: "ArrayAccess", array, index, line };
}

function intLiteral(value, line) {
  return { kind: "IntLiteral", value, line };
}

function charLiteral(value, line) {
  return { kind: "CharLiteral", value, line };
}

function stringLiteral(value, line) {
  return { kind: "StringLiteral", value, line };
}

// Left-associative binary expression builder
function buildBinaryLeft(head, tail) {
  return tail.reduce((left, [op, right]) => {
    return binaryExpr(op, left, right, left.line);
  }, head);
}
}}

// ============================================================
// Program
// ============================================================

Program
  = __ decls:TopLevel* {
      return program(decls);
    }

// ============================================================
// Top-Level Declarations
// ============================================================

TopLevel
  = FunctionDecl
  / TypedDecl
  / Statement

FunctionDecl
  = t:TypeKeyword __ n:Identifier __ "(" __ params:ParamList __ ")" __ body:Block {
      return functionDecl(t, n, params, body, location().start.line);
    }

TypedDecl
  = t:TypeKeyword __ n:Identifier __ "[" __ size:IntegerLiteral __ "]" __ init:ArrayInit? __ ";" __ {
      return arrayDecl(t, n, size.value, init, location().start.line);
    }
  / t:TypeKeyword __ n:Identifier __ "=" __ e:Expression __ ";" __ {
      return varDecl(t, n, e, location().start.line);
    }
  / t:TypeKeyword __ n:Identifier __ ";" __ {
      return varDecl(t, n, undefined, location().start.line);
    }

ArrayInit
  = "=" __ "{" __ head:Expression tail:(__ "," __ Expression)* __ "}" {
      return [head, ...tail.map(t => t[3])];
    }

ParamList
  = head:Param tail:(__ "," __ Param)* {
      return [head, ...tail.map(t => t[3])];
    }
  / "" { return []; }

Param
  = t:TypeKeyword __ n:Identifier {
      return { type: t, name: n };
    }

// ============================================================
// Statements
// ============================================================

Statement
  = Block
  / IfStatement
  / WhileStatement
  / ForStatement
  / ReturnStatement
  / BreakStatement
  / ContinueStatement
  / LocalDecl
  / ExpressionStatement

Block
  = "{" __ stmts:Statement* __ "}" __ {
      return blockStmt(stmts);
    }

IfStatement
  = "if" __ "(" __ cond:Expression __ ")" __ then:Statement else_:(__ "else" __ Statement)? {
      return ifStmt(cond, then, else_ ? else_[3] : null, location().start.line);
    }

WhileStatement
  = "while" __ "(" __ cond:Expression __ ")" __ body:Statement {
      return whileStmt(cond, body, location().start.line);
    }

ForStatement
  = "for" __ "(" __ init:ForInit? __ cond:Expression? __ ";" __ update:Expression? __ ")" __ body:Statement {
      return forStmt(init, cond, update, body, location().start.line);
    }

ForInit
  = t:TypeKeyword __ n:Identifier __ "=" __ e:Expression __ ";" {
      return varDecl(t, n, e, location().start.line);
    }
  / t:TypeKeyword __ n:Identifier __ ";" {
      return varDecl(t, n, undefined, location().start.line);
    }
  / e:Expression __ ";" {
      return exprStmt(e);
    }
  / ";" { return undefined; }

ReturnStatement
  = "return" !IdentContinue __ e:Expression? __ ";" __ {
      return returnStmt(e, location().start.line);
    }

BreakStatement
  = "break" !IdentContinue __ ";" __ {
      return breakStmt(location().start.line);
    }

ContinueStatement
  = "continue" !IdentContinue __ ";" __ {
      return continueStmt(location().start.line);
    }

LocalDecl
  = t:TypeKeyword __ n:Identifier __ "[" __ size:IntegerLiteral __ "]" __ init:ArrayInit? __ ";" __ {
      return arrayDecl(t, n, size.value, init, location().start.line);
    }
  / t:TypeKeyword __ n:Identifier __ "=" __ e:Expression __ ";" __ {
      return varDecl(t, n, e, location().start.line);
    }
  / t:TypeKeyword __ n:Identifier __ ";" __ {
      return varDecl(t, n, undefined, location().start.line);
    }

ExpressionStatement
  = e:Expression __ ";" __ {
      return exprStmt(e);
    }

// ============================================================
// Expressions (precedence climbing)
// ============================================================

Expression
  = Assignment

Assignment
  = target:PostfixExpression __ op:AssignOp __ value:Assignment {
      return assignExpr(op, target, value, target.line);
    }
  / OrExpression

AssignOp
  = "=" !"=" { return "="; }
  / "+=" { return "+="; }
  / "-=" { return "-="; }

OrExpression
  = head:AndExpression tail:(__ "||" __ AndExpression)* {
      return buildBinaryLeft(head, tail.map(t => [t[1], t[3]]));
    }

AndExpression
  = head:EqualityExpression tail:(__ "&&" __ EqualityExpression)* {
      return buildBinaryLeft(head, tail.map(t => [t[1], t[3]]));
    }

EqualityExpression
  = head:ComparisonExpression tail:(__ EqualityOp __ ComparisonExpression)* {
      return buildBinaryLeft(head, tail.map(t => [t[1], t[3]]));
    }

EqualityOp
  = "==" { return "=="; }
  / "!=" { return "!="; }

ComparisonExpression
  = head:AdditiveExpression tail:(__ ComparisonOp __ AdditiveExpression)* {
      return buildBinaryLeft(head, tail.map(t => [t[1], t[3]]));
    }

ComparisonOp
  = "<=" { return "<="; }
  / ">=" { return ">="; }
  / "<" { return "<"; }
  / ">" { return ">"; }

AdditiveExpression
  = head:MultiplicativeExpression tail:(__ AdditiveOp __ MultiplicativeExpression)* {
      return buildBinaryLeft(head, tail.map(t => [t[1], t[3]]));
    }

AdditiveOp
  = "+" !"=" !"+"{return "+";}
  / "-" !"=" !"-"{ return "-"; }

MultiplicativeExpression
  = head:UnaryExpression tail:(__ MultiplicativeOp __ UnaryExpression)* {
      return buildBinaryLeft(head, tail.map(t => [t[1], t[3]]));
    }

MultiplicativeOp
  = "*" { return "*"; }
  / "/" !"/" { return "/"; }
  / "%" { return "%"; }

UnaryExpression
  = "-" !"=" !"-" __ e:UnaryExpression {
      return unaryExpr("-", e, true, location().start.line);
    }
  / "!" !"=" __ e:UnaryExpression {
      return unaryExpr("!", e, true, location().start.line);
    }
  / "++" __ e:UnaryExpression {
      return unaryExpr("++", e, true, location().start.line);
    }
  / "--" __ e:UnaryExpression {
      return unaryExpr("--", e, true, location().start.line);
    }
  / PostfixExpression

PostfixExpression
  = expr:PrimaryExpression suffixes:PostfixSuffix* {
      return suffixes.reduce((e, s) => s(e), expr);
    }

PostfixSuffix
  = __ "[" __ idx:Expression __ "]" {
      return (e) => {
        if (e.kind === "VarRef") {
          return arrayAccess(e.name, idx, e.line);
        }
        return arrayAccess("?", idx, e.line);
      };
    }
  / __ "++" {
      return (e) => unaryExpr("++", e, false, e.line);
    }
  / __ "--" {
      return (e) => unaryExpr("--", e, false, e.line);
    }

PrimaryExpression
  = IntegerLiteral
  / CharacterLiteral
  / StringLiteralExpr
  / BuiltinCall
  / FunctionCall
  / IdentifierExpr
  / ParenExpression

IntegerLiteral
  = "0x" digits:$[0-9a-fA-F]+ __ {
      return intLiteral(parseInt(digits, 16), location().start.line);
    }
  / digits:$[0-9]+ __ {
      return intLiteral(parseInt(digits, 10), location().start.line);
    }

CharacterLiteral
  = "'" ch:CharContent "'" __ {
      return charLiteral(ch.charCodeAt(0), location().start.line);
    }

CharContent
  = "\\" esc:EscapeChar { return esc; }
  / [^'\\]

EscapeChar
  = "n" { return "\n"; }
  / "t" { return "\t"; }
  / "r" { return "\r"; }
  / "0" { return "\0"; }
  / "\\" { return "\\"; }
  / "'" { return "'"; }
  / '"' { return '"'; }

StringLiteralExpr
  = '"' chars:StringChar* '"' __ {
      return stringLiteral(chars.join(""), location().start.line);
    }

StringChar
  = "\\" esc:EscapeChar { return esc; }
  / [^"\\]

BuiltinCall
  = name:BuiltinName __ "(" __ args:ArgumentList __ ")" __ {
      return callExpr(name, args, location().start.line);
    }

BuiltinName
  = $("putc" !IdentContinue)  { return "putc"; }
  / $("getc" !IdentContinue)  { return "getc"; }
  / $("getn" !IdentContinue)  { return "getn"; }
  / $("print" !IdentContinue) { return "print"; }

FunctionCall
  = name:Identifier __ "(" __ args:ArgumentList __ ")" __ {
      return callExpr(name, args, location().start.line);
    }

ArgumentList
  = head:Expression tail:(__ "," __ Expression)* {
      return [head, ...tail.map(t => t[3])];
    }
  / "" { return []; }

IdentifierExpr
  = name:Identifier __ {
      return varRef(name, location().start.line);
    }

ParenExpression
  = "(" __ e:Expression __ ")" __ { return e; }

// ============================================================
// Lexical Rules
// ============================================================

TypeKeyword
  = $("int" !IdentContinue)   { return "int"; }
  / $("char" !IdentContinue)  { return "char"; }
  / $("void" !IdentContinue)  { return "void"; }

Identifier
  = !ReservedWord name:$([a-zA-Z_] [a-zA-Z0-9_]*) { return name; }

ReservedWord
  = ("int" / "char" / "void" / "if" / "else" / "while" / "for"
    / "return" / "break" / "continue" / "putc" / "getc" / "getn" / "print") !IdentContinue

IdentContinue
  = [a-zA-Z0-9_]

// ============================================================
// Whitespace & Comments
// ============================================================

__
  = (Whitespace / LineComment / BlockComment)*

Whitespace
  = [ \t\r\n]

LineComment
  = "//" [^\n]*

BlockComment
  = "/*" (!"*/" .)* "*/"
