# Subleq Compiler & VM

A web-based IDE for a C-like language that compiles to **SUBLEQ** — the one-instruction computer — and runs directly in the browser.

## What is SUBLEQ?

**SUBLEQ** (SUBtract and branch if Less than or EQual to zero) is a one-instruction-set computer (OISC). Every operation boils down to a single instruction:

```
SUBLEQ A B C
```

Meaning: `mem[B] -= mem[A]`; if the result is `≤ 0`, jump to `C`.

Despite having only one instruction, SUBLEQ is Turing-complete. This project implements a full compiler from a C-like high-level language down to SUBLEQ machine code.

## Features

### Language

A C-like compiled language with:

| Feature | Examples |
|---|---|
| Primitive types | `int` |
| Global & local variables | `int x = 42;` |
| Fixed-size arrays | `int buf[16];` |
| Arithmetic | `+ - * / %` |
| Comparison | `== != < > <= >=` |
| Logical | `&& \|\| !` |
| Unary | `- ++ --` |
| Compound assignment | `+= -=` |
| Control flow | `if / else`, `while`, `for`, `break`, `continue` |
| Functions | user-defined with parameters and return values |
| Character literals | `'A'` → ASCII code |
| String literals | `"hello\n"` → null-terminated array |

### Built-in I/O

| Function | Description |
|---|---|
| `putc(c)` | Output character with ASCII code `c` |
| `print(n)` | Output integer `n` as decimal digits |
| `getc()` | Read one character from stdin, return its ASCII code |
| `getn()` | Read one decimal integer from stdin |

### Virtual Machine

- **Architecture**: 32-bit word, 64 K-word address space
- **Instruction**: single SUBLEQ triplet
- **Trap codes** (encoded as negative addresses):

| Code | Meaning |
|---|---|
| `−1` | `HALT` |
| `−2` | `PUTC` — write `mem[A]` as a character |
| `−3` | `GETC` — read a character into `mem[B]` |
| `−4` | `PUTN` — write `mem[A]` as a decimal number |
| `−5` | `GETN` — read a decimal number into `mem[B]` |

## Demo Programs

Five example programs are bundled in the IDE:

- **Hello World** — classic first program
- **FizzBuzz** — 1–20 with Fizz/Buzz substitution
- **Fibonacci** — first N Fibonacci numbers
- **Calc** — expression calculator supporting `+ − * /` and parentheses via the shunting-yard algorithm
- **Brainfuck Interpreter** — a full BF interpreter written in the C-like language, running on SUBLEQ

## Architecture

```
Source code (C-like)
       │
       ▼
  PEG Parser (grammar.peggy / peggy 5)
       │ AST
       ▼
   Compiler (compiler.ts)
       │ Macro IR
       ▼
   Code Generator (pipeline.ts)
       │ SUBLEQ word array
       ▼
  32-bit VM (vm.ts)
       │
       ▼
  stdout / memory dump
```

| File | Role |
|---|---|
| `src/lib/subleq/grammar.peggy` | PEG grammar → AST |
| `src/lib/subleq/compiler.ts` | AST → macro IR |
| `src/lib/subleq/pipeline.ts` | Macro IR → SUBLEQ binary |
| `src/lib/subleq/vm.ts` | 32-bit SUBLEQ virtual machine |
| `src/lib/subleq/assembler.ts` | Low-level label resolver |
| `src/lib/subleq/demos.ts` | Built-in demo programs |
| `src/lib/subleq/types.ts` | Shared AST / IR type definitions |
| `src/components/subleq-ide.tsx` | Three-panel web IDE (editor · assembly · I/O) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/)

### Install & run

```bash
pnpm install
pnpm dev
```

Open <http://localhost:5173> in your browser.

### Build

```bash
pnpm build
```

Output is placed in `dist/`.

### Test

```bash
pnpm test
```

140 tests covering the full pipeline (16 demo E2E tests + 124 language feature tests).

## Tech Stack

| Layer | Technology |
|---|---|
| UI framework | React 19 |
| Language | TypeScript 5 |
| Build tool | Vite 7 |
| Styling | Tailwind CSS v4 |
| UI components | shadcn/ui (Base UI + Radix) |
| Parser generator | peggy 5 |
| Test runner | vitest 4 |

## License

MIT
