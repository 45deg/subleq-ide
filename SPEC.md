# SUBLEQ System Specification

> **Version:** 1.0 · **Date:** 2026-03-01

This document specifies the complete stack of the SUBLEQ system:

1. [High-Level Language](#1-high-level-language)
2. [Macro Assembly IR](#2-macro-assembly-ir)
3. [Virtual Machine](#3-virtual-machine)
4. [Compilation Pipeline](#4-compilation-pipeline)
5. [Memory Layout](#5-memory-layout)

---

## 1. High-Level Language

The source language is a minimal, C-like language that compiles down to SUBLEQ machine code.

### 1.1 Lexical Structure

#### Keywords

```
int  char  void
if   else  while  for
return  break  continue
putc  getc  getn  print
```

#### Identifiers

Start with a letter or `_`, followed by any number of letters, digits, or `_`.  
Reserved words cannot be used as identifiers.

#### Literals

| Kind | Examples | Notes |
|------|----------|-------|
| Decimal integer | `0`, `42`, `-1` | Stored as signed 32-bit |
| Hexadecimal integer | `0xFF`, `0x1A2B` | Case-insensitive hex digits |
| Character | `'a'`, `'\n'`, `'\0'` | Single UTF-16 code unit; stored as 32-bit int |
| String | `"hello\n"` | Null-terminated array of `int` words; evaluates to base address |

#### Escape Sequences

| Escape | Value |
|--------|-------|
| `\n` | newline (0x0A) |
| `\t` | tab (0x09) |
| `\r` | carriage return (0x0D) |
| `\0` | null (0x00) |
| `\\` | backslash |
| `\'` | single quote |
| `\"` | double quote |

#### Comments

```c
// single-line comment

/* multi-line
   comment */
```

---

### 1.2 Types

| Type | Description |
|------|-------------|
| `int` | Signed 32-bit integer |
| `char` | Synonym for `int`; used for character values |
| `void` | Return type only; no value |

There is no implicit type conversion — all values are internally 32-bit words.

---

### 1.3 Declarations

#### Global Variables

```c
int x;          // initialized to 0
int y = 42;     // initialized with expression
char c = 'A';
```

#### Global Arrays

```c
int buf[64];                   // zero-initialized
int primes[5] = {2,3,5,7,11}; // explicit initializer list
```

#### Functions

```c
int add(int a, int b) {
    return a + b;
}

void greet() {
    putc('H'); putc('i'); putc('\n');
}

int main() {
    // entry point
}
```

- Parameters are passed by value.
- Functions without an explicit `return` implicitly return `0` (the value left in `_ret_val`).
- Recursion is supported via the call/return mechanism.

#### Local Variables

Variables can be declared at the start of any block or inline in `for` init:

```c
int n = 10;
int arr[8];
for (int i = 0; i < n; i++) { ... }
```

---

### 1.4 Statements

| Statement | Syntax |
|-----------|--------|
| Block | `{ stmt* }` |
| Expression | `expr ;` |
| Variable declaration | `int name = expr ;` |
| Array declaration | `int name [ size ] ;` |
| If / If-else | `if ( cond ) stmt` · `if ( cond ) stmt else stmt` |
| While | `while ( cond ) stmt` |
| For | `for ( init? ; cond? ; update? ) stmt` |
| Return | `return expr? ;` |
| Break | `break ;` |
| Continue | `continue ;` |

`break` and `continue` apply to the immediately enclosing `while` or `for` loop.

---

### 1.5 Expressions

Operator precedence from highest to lowest:

| Precedence | Operators | Associativity |
|-----------|-----------|---------------|
| 8 (highest) | `++` `--` (postfix), `[ ]` | left |
| 7 | `-` `!` `++` `--` (prefix, unary) | right |
| 6 | `*` `/` `%` | left |
| 5 | `+` `-` | left |
| 4 | `<` `>` `<=` `>=` | left |
| 3 | `==` `!=` | left |
| 2 | `&&` | left |
| 1 | `\|\|` | left |
| 0 (lowest) | `=` `+=` `-=` | right |

#### Assignment Operators

| Operator | Semantics |
|----------|-----------|
| `=` | Store value |
| `+=` | Add and store |
| `-=` | Subtract and store |

Assignment is an expression that evaluates to the assigned value.  
The target must be a variable reference or array element (`a[i]`).

#### Arithmetic & Comparison

All operations work on signed 32-bit integers with wrap-around semantics.

- `*` — repeated addition (loop-based; not constant time)
- `/` — truncated toward zero; division by zero is undefined
- `%` — remainder; sign follows the dividend

Boolean comparisons produce `1` (true) or `0` (false).

#### Logical Operators

`&&` and `||` use short-circuit evaluation based on whether the left operand is
positive (`> 0` = truthy, `<= 0` = falsy).

> **Note:** The truthiness model follows the SUBLEQ branch condition:  
> a value is **truthy** if `> 0`, **falsy** if `<= 0`.  
> `0` is falsy; **negative values are also falsy**.

#### Increment / Decrement

| Operator | Returns |
|----------|---------|
| `++x` | New value (after increment) |
| `--x` | New value (after decrement) |
| `x++` | Old value (before increment) |
| `x--` | Old value (before decrement) |

Currently only supported on simple variable references.

---

### 1.6 Built-in Functions

| Call | Description |
|------|-------------|
| `putc(expr)` | Output the character whose code is `expr` |
| `getc()` | Read one character from stdin; return its code |
| `getn()` | Read one decimal integer from stdin; return it |
| `print(expr)` | Output `expr` as a decimal number (no newline) |

These map directly to VM traps and do not consume a call frame.

---

### 1.7 Strings

A string literal allocates a contiguous, null-terminated sequence of 32-bit words in the data segment and evaluates to its base address:

```c
int s = "hello";   // s = address of 'h'
putc(s[0]);        // outputs 'h'
```

The null terminator is `0`.

---

### 1.8 Scoping Rules

- Globals are visible program-wide.
- Each block `{ }` introduces a new scope.
- Inner declarations shadow outer ones.
- Local variables are allocated as named data cells in the linear address space (no stack frames); each declaration gets a unique label.

---

## 2. Macro Assembly IR

The compiler (code generator) outputs a sequence of **macro instructions** that form an intermediate representation between the high-level language and raw SUBLEQ. The assembler then expands each macro into one or more SUBLEQ triples.

### 2.1 Operand Conventions

- Operands are **memory addresses** (label names or numeric addresses).
- `X`, `Y`, `Z` below denote address operands.
- `imm` denotes an integer immediate value (encoded as an inline data word).
- `L` denotes a branch target label.

### 2.2 Data & Layout Macros

| Macro | Arguments | Description |
|-------|-----------|-------------|
| `LABEL` | `L` | Define label `L` at current PC |
| `DATA` | `name, value` | Reserve one word initialised to `value` |
| `ARRAY` | `name, size` | Reserve `size` zero-initialised words |
| `STRDATA` | `name, c₁…cₙ, 0` | Reserve a null-terminated character array |

### 2.3 Transfer Macros

| Macro | Semantics | SUBLEQ cost |
|-------|-----------|-------------|
| `CLR X` | `X = 0` | 1 |
| `SET X, imm` | `X = imm` | 1 + (5 if imm ≠ 0) |
| `MOV X, Y` | `X = Y` | 4 |
| `NEG X` | `X = −X` | 6 |

### 2.4 Arithmetic Macros

| Macro | Semantics | SUBLEQ cost |
|-------|-----------|-------------|
| `ADD X, Y` | `X += Y` | 3 |
| `SUB X, Y` | `X -= Y` | 1 |
| `MUL X, Y` | `X *= Y` (loop) | O(\|Y\|) |
| `DIV X, Y` | `X /= Y` (loop) | O(X/Y) |
| `MOD X, Y` | `X %= Y` (loop) | O(X/Y) |

`MUL`, `DIV`, `MOD` are implemented using loops of additions / subtractions
and execute in time proportional to the operand magnitudes.

### 2.5 Branch Macros

| Macro | Arguments | Jump condition |
|-------|-----------|----------------|
| `JMP` | `L` | Always |
| `JLE` | `X, L` | `X <= 0` |
| `JGT` | `X, L` | `X > 0` |
| `JEQ` | `X, Y, L` | `X == Y` |
| `JNE` | `X, Y, L` | `X != Y` |
| `JLT` | `X, Y, L` | `X < Y` |
| `JGT` | `X, Y, L` | `X > Y` |
| `JLTE` | `X, Y, L` | `X <= Y` |
| `JGTE` | `X, Y, L` | `X >= Y` |

Non-destructive: source operands are not modified.  
Comparisons use scratch registers `__T3` / `__T4` to compute a temporary difference.

### 2.6 I/O Macros

| Macro | Arguments | Description |
|-------|-----------|-------------|
| `PUTC` | `X` | Output `mem[X]` as ASCII character (trap −2) |
| `PUTN` | `X` | Output `mem[X]` as decimal (trap −4) |
| `GETC` | `X` | Read one char into `mem[X]` (trap −3) |
| `GETN` | `X` | Read one decimal integer into `mem[X]` (trap −5) |
| `HALT` | — | Terminate execution (trap −1) |

### 2.7 Call/Return Macros

| Macro | Arguments | Description |
|-------|-----------|-------------|
| `CALL` | `F` | Store return address, jump to `F` |
| `RET` | — | Jump back to stored return address |

**Calling convention:**

- Caller stores arguments in dedicated parameter slots `_param_<func>_<i>`.
- Callee copies parameter slots into local variables at function entry.
- Return value is stored in the global cell `__ret_val`.
- After `CALL`, the caller loads `__ret_val` into the desired destination.
- Return address is communicated through `__call_ret_addr` and a **return trampoline**
  — a self-modifying SUBLEQ triple whose branch field is patched at each call site.

### 2.8 Memory-Indirect Macros

| Macro | Arguments | Description |
|-------|-----------|-------------|
| `LEA` | `dst, label` | Load the address of `label` into `dst` |
| `LOAD` | `dst, addrVar` | `dst = mem[mem[addrVar]]` (indirect read) |
| `STORE` | `addrVar, src` | `mem[mem[addrVar]] = src` (indirect write) |

`LOAD` and `STORE` use self-modifying code: the A or B operand of a SUBLEQ
triple is patched at runtime with the computed address before execution.

### 2.9 Reserved Scratch Cells

The assembler/code-generator allocates a fixed set of data cells in the data
segment for internal use:

| Label | Purpose |
|-------|---------|
| `__Z` | Constant 0 (never modified by user code) |
| `__ONE` | Constant 1 |
| `__T1` – `__T4` | General-purpose scratch registers |
| `__call_ret_addr` | Holds the return address for the current call |
| `__ret_val` | Return value of the most recently called function |
| `__ret_trampoline` | Self-modifying return-jump triple |
| `__ret_trampoline_c` | C-field of the return trampoline (patched per call) |

---

## 3. Virtual Machine

### 3.1 Architecture

| Property | Value |
|----------|-------|
| Word size | 32 bits (signed two's complement) |
| Word range | −2 147 483 648 .. 2 147 483 647 |
| Memory | 65 536 words (256 KB) |
| Program counter (PC) | Word address; starts at `0` |
| Instruction size | 3 words |

### 3.2 The SUBLEQ Instruction

```
SUBLEQ  A  B  C
```

Every instruction occupies exactly **three consecutive words** at address `PC`:

```
mem[PC+0] = A   (source operand address)
mem[PC+1] = B   (destination operand address)
mem[PC+2] = C   (branch target address)
```

**Execution semantics:**

```
mem[B] = mem[B] − mem[A]          // 32-bit signed subtraction with wrap-around
if mem[B] <= 0:
    PC = C
else:
    PC = PC + 3
```

**Bounds checking:**

- If `PC`, `PC+1`, or `PC+2` is out of range [0, memorySize − 1], execution halts with an error.
- If `A` or `B` is out of range and C is not a trap, execution halts with an error.

### 3.3 Trap Instructions

When `C` (the branch field) is **negative**, the instruction is a **trap** rather
than a normal SUBLEQ. The subtraction `mem[B] -= mem[A]` is **not** performed;
instead, the VM executes a side-effect and advances `PC` by 3.

| C value | Name | Effect |
|---------|------|--------|
| `−1` (`0xFFFFFFFF`) | `HALT` | Stop execution |
| `−2` (`0xFFFFFFFE`) | `PUTC` | Output `mem[A]` as an ASCII character; `PC += 3` |
| `−3` (`0xFFFFFFFD`) | `GETC` | Read one character from input; store its code in `mem[A]`; `PC += 3` |
| `−4` (`0xFFFFFFFC`) | `PUTN` | Output `mem[A]` as a decimal integer; `PC += 3` |
| `−5` (`0xFFFFFFFB`) | `GETN` | Read one decimal integer from input; store it in `mem[A]`; `PC += 3` |
| other negative | — | Halt with "Unknown trap" error |

**Input blocking:** If `GETC` or `GETN` is issued when the input buffer is empty,
`PC` is **not** advanced and the `needsInput` flag is returned to the caller.
The host must supply more input and re-run from the same PC.

#### GETN Parsing Rules

- Leading whitespace (` `, `\t`, `\n`, `\r`) is consumed before the number.
- An optional leading sign (`+` or `−`) is accepted.
- Digits are read until a non-digit character or end of buffer.
- If no digits are found, `0` is stored and the non-digit character is left in the buffer.
- The result is clamped to a signed 32-bit integer via `| 0`.

### 3.4 Arithmetic Semantics

All arithmetic is **32-bit signed** integer arithmetic:

```
result = (mem[B] - mem[A]) | 0   // JavaScript-style 32-bit truncation
```

There is no overflow exception; results wrap around silently.

Character output (`PUTC`) uses only the low 16 bits of `mem[A]`:

```
char = String.fromCharCode(mem[A] & 0xFFFF)
```

### 3.5 Initial State

| Component | Initial value |
|-----------|---------------|
| Memory | Binary loaded at address 0; remaining words are 0 |
| PC | 0 |
| Halted | false |
| Output | empty string |
| Input buffer | empty string |
| Input position | 0 |
| Cycle count | 0 |

### 3.6 Execution Loop

```
run(maxSteps):
    while !halted AND steps < maxSteps:
        result = step()
        if result.halted OR result.error: break
        if result.needsInput:             break (resume when input arrives)
    return { halted, steps, needsInput }
```

The default step budget is **1 000 000** cycles per `run()` call.

### 3.7 Disassembly Format

The debugger formats memory as:

```
<label>:
► XXXX: SUBLEQ  A  B  C
```

- `►` marks the current PC.
- `XXXX` is the hex word address.
- Labels whose names begin with `__` are hidden from the disassembly view.

---

## 4. Compilation Pipeline

```
Source text
    │
    ▼  Peggy PEG parser (grammar.peggy)
   AST  (ProgramNode tree)
    │
    ▼  SubleqCodeGen (pipeline.ts)
   SUBLEQ words + label table
    │
    ▼  Two-pass linker (resolve())
  Int32Array binary + label map
    │
    ▼  VM loader (createVM / resetVM)
  Execution
```

### 4.1 Parser

The grammar ([grammar.peggy](src/lib/subleq/grammar.peggy)) is a PEG grammar processed by
[Peggy](https://peggyjs.org/). It produces the AST types defined in
[types.ts](src/lib/subleq/types.ts).

### 4.2 Code Generator

[pipeline.ts](src/lib/subleq/pipeline.ts) — `SubleqCodeGen`:

1. **First pass — global collection:**  
   Scans top-level declarations to register globals and arrays before emitting any code.
2. **Code emission:**  
   Visits each AST node recursively, emitting SUBLEQ triples with symbolic label references (`string` values).  
   Data declarations are accumulated in a deferred list and emitted after the code.
3. **Label fixups:**  
   After all code is emitted, label-address pairs recorded in `labelFixups[]` are written into the correct data cells.
4. **Resolution pass:**  
   Each emitted word is either a literal `number` (written as-is) or a `string` label reference (looked up in the label map). Unresolved labels produce a compile error.

The binary starts at word address `0`. The code generator emits a `JMP __main_entry` as the very first instruction so that function bodies that appear before `main` are skipped.

### 4.3 Compilation Result

```typescript
interface CompilationResult {
  success:      boolean;
  errors:       CompileError[];
  binary?:      Int32Array;    // final SUBLEQ binary
  labels?:      Map<string, number>;  // label → word address
  macroText?:   string;        // macro IR listing
  assemblyText?: string;       // annotated SUBLEQ listing
  ast?:         ProgramNode;
}
```

---

## 5. Memory Layout

```
Word address   Purpose
─────────────────────────────────────────────
0x0000         Program entry (JMP __main_entry)
0x0001 – 0x00FF  (reserved / unused in current layout)
0x0100+        Code segment start (CODE_START = 256)
               ├─ Function bodies
               ├─ Return trampoline
               └─ Data segment
                  ├─ System cells (__Z, __T1..T4, __ONE, …)
                  ├─ Global variables & arrays
                  ├─ String literals (null-terminated)
                  ├─ Local variables (inlined, uniquely named)
                  └─ Compiler temporaries (__tmp_N)
```

> **Note:** There is no hardware stack. Local variables and temporaries are
> allocated as named data cells in the flat address space. Nested calls are
> supported via the self-modifying return trampoline, but recursion requires
> care because there is only one storage cell per variable name per function.

### 5.1 System Constants

| Symbol | Address reference | Value |
|--------|-----------------|-------|
| `WORD_SIZE` | — | 4 (bytes per word) |
| `WORD_BITS` | — | 32 |
| `WORD_MAX` | — | 2 147 483 647 |
| `WORD_MIN` | — | −2 147 483 648 |
| `MEMORY_SIZE` | — | 65 536 words |
| `CODE_START` | — | 256 (0x0100) |
| `TRAP_HALT` | C = −1 | `0xFFFFFFFF` |
| `TRAP_PUTC` | C = −2 | `0xFFFFFFFE` |
| `TRAP_GETC` | C = −3 | `0xFFFFFFFD` |
| `TRAP_PUTN` | C = −4 | `0xFFFFFFFC` |
| `TRAP_GETN` | C = −5 | `0xFFFFFFFB` |

---

## Appendix: Worked Example

**Source:**

```c
int main() {
    int x = 3;
    int y = 4;
    print(x + y);
    putc('\n');
    return 0;
}
```

**Conceptual macro IR (abbreviated):**

```
JMP        __main_entry
_fn_main:
  DATA     _l_main_x, 0
  DATA     _l_main_y, 0
  SET      _l_main_x, 3
  SET      _l_main_y, 4
  MOV      __tmp_0, _l_main_x
  ADD      __tmp_0, _l_main_y
  PUTN     __tmp_0
  SET      __tmp_1, 10           ; '\n' = 0x0A
  PUTC     __tmp_1
  SET      __ret_val, 0
  RET
__main_entry:
  CALL     _fn_main
  HALT
```

**Key SUBLEQ expansions:**

```
; SET x, 3  →  CLR x; load const 3; x = 3
XXXX: SUBLEQ  x  x  next
XXXX: SUBLEQ  T1 T1 next
XXXX: SUBLEQ  $3 T1 next       ; T1 = −3
XXXX: SUBLEQ  T1 x  next       ; x  = 0 − (−3) = 3
XXXX: SUBLEQ  Z  Z  next+1     ; JMP over constant
XXXX: 3                        ; inline constant

; PUTN tmp  →  single trap instruction
XXXX: SUBLEQ  tmp  Z  −4       ; output mem[tmp] as decimal
```

**Resulting binary:** a flat `Int32Array` loaded at word address 0 and executed
by the SUBLEQ VM starting at `PC = 0`.
