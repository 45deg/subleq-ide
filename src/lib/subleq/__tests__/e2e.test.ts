// ============================================================
// End-to-End Pipeline Tests
// C-like source → compile → SUBLEQ VM execution → output check
//
// Coverage:
//   - Literals & basic output
//   - Arithmetic (+, -, *, /, %)
//   - Variables (global / local)
//   - Comparison operators (==, !=, <, >, <=, >=)
//   - Logical operators (&&, ||, !)
//   - Unary operators (-, ++, --)
//   - Assignment operators (=, +=, -=)
//   - Control flow (if/else, while, for, break, continue)
//   - User-defined functions
//   - Arrays (read/write)
//   - I/O (getc, getn, putc, print)
//   - Complex programs (sum, max, GCD, prime check, etc.)
// ============================================================

import { describe, it, expect } from "vitest";
import { compile } from "../pipeline";
import { createVM, run } from "../vm";

// ---- Shared helper ----
function runProgram(
  source: string,
  input = "",
  maxSteps = 2_000_000,
): { output: string; halted: boolean; error?: string } {
  const result = compile(source);
  if (!result.success || !result.binary) {
    return {
      output: "",
      halted: false,
      error: `Compilation failed: ${result.errors.map(e => e.message).join("; ")}`,
    };
  }

  const vm = createVM(result.binary);
  vm.inputBuffer = input;

  let totalSteps = 0;
  while (totalSteps < maxSteps) {
    const r = run(vm, maxSteps - totalSteps);
    totalSteps += r.steps;
    if (r.halted) break;
    if (r.needsInput) {
      if (vm.inputPos >= vm.inputBuffer.length) {
        vm.inputBuffer += "\n";
      }
    }
  }

  return { output: vm.output, halted: vm.halted };
}

// ============================================================
// 1. Literals & basic output
// ============================================================
describe("1. Literals & basic output", () => {
  it("print integer literal 42", () => {
    const { output, halted } = runProgram("print(42);");
    expect(halted).toBe(true);
    expect(output).toBe("42");
  });

  it("print zero", () => {
    const { output } = runProgram("print(0);");
    expect(output).toBe("0");
  });

  it("print hex literal 0xFF = 255", () => {
    const { output } = runProgram("print(0xFF);");
    expect(output).toBe("255");
  });

  it("putc outputs ASCII character", () => {
    const { output } = runProgram("putc(65);"); // 'A'
    expect(output).toBe("A");
  });

  it("putc with char literal 'Z'", () => {
    const { output } = runProgram("putc('Z');");
    expect(output).toBe("Z");
  });

  it("putc escape: newline", () => {
    const { output } = runProgram("putc('\\n');");
    expect(output).toBe("\n");
  });

  it("consecutive prints", () => {
    const { output } = runProgram("print(1); print(2); print(3);");
    expect(output).toBe("123");
  });

  it("print and putc combined", () => {
    const { output } = runProgram("print(99); putc('!');");
    expect(output).toBe("99!");
  });
});

// ============================================================
// 2. Arithmetic
// ============================================================
describe("2. Arithmetic operations", () => {
  it("addition: 2+3=5", () => {
    const { output } = runProgram("print(2+3);");
    expect(output).toBe("5");
  });

  it("subtraction: 10-4=6", () => {
    const { output } = runProgram("print(10-4);");
    expect(output).toBe("6");
  });

  it("multiplication: 3*7=21", () => {
    const { output } = runProgram("print(3*7);");
    expect(output).toBe("21");
  });

  it("division: 20/4=5", () => {
    const { output } = runProgram("print(20/4);");
    expect(output).toBe("5");
  });

  it("integer division truncates: 7/2=3", () => {
    const { output } = runProgram("print(7/2);");
    expect(output).toBe("3");
  });

  it("modulo: 17%5=2", () => {
    const { output } = runProgram("print(17%5);");
    expect(output).toBe("2");
  });

  it("modulo exact division: 10%5=0", () => {
    const { output } = runProgram("print(10%5);");
    expect(output).toBe("0");
  });

  it("operator precedence: 2+3*4=14", () => {
    const { output } = runProgram("print(2+3*4);");
    expect(output).toBe("14");
  });

  it("parentheses override precedence: (2+3)*4=20", () => {
    const { output } = runProgram("print((2+3)*4);");
    expect(output).toBe("20");
  });

  it("chained operations: 1+2+3+4+5=15", () => {
    const { output } = runProgram("print(1+2+3+4+5);");
    expect(output).toBe("15");
  });

  it("subtraction to negative: 3-10=-7", () => {
    const { output } = runProgram("print(3-10);");
    expect(output).toBe("-7");
  });

  it("multiplication of negatives: (-3)*(-4)=12", () => {
    const { output } = runProgram("print((-3)*(-4));");
    expect(output).toBe("12");
  });

  it("mixed sign multiply: 5*(-3)=-15", () => {
    const { output } = runProgram("print(5*(-3));");
    expect(output).toBe("-15");
  });
});

// ============================================================
// 3. Variables (global / local)
// ============================================================
describe("3. Variables", () => {
  it("global variable with initializer", () => {
    const { output } = runProgram(`
      int x = 42;
      print(x);
    `);
    expect(output).toBe("42");
  });

  it("global variable without initializer (defaults to 0)", () => {
    const { output } = runProgram(`
      int x;
      print(x);
    `);
    expect(output).toBe("0");
  });

  it("local variable in main()", () => {
    const { output } = runProgram(`
      int main() {
        int x = 10;
        print(x);
        return 0;
      }
    `);
    expect(output).toBe("10");
  });

  it("variable reassignment", () => {
    const { output } = runProgram(`
      int x = 1;
      x = 99;
      print(x);
    `);
    expect(output).toBe("99");
  });

  it("multiple globals", () => {
    const { output } = runProgram(`
      int a = 3;
      int b = 7;
      print(a + b);
    `);
    expect(output).toBe("10");
  });

  it("global then local shadowing", () => {
    const { output } = runProgram(`
      int main() {
        int a = 5;
        int b = a * 2;
        print(b);
        return 0;
      }
    `);
    expect(output).toBe("10");
  });
});

// ============================================================
// 4. Comparison operators
// ============================================================
describe("4. Comparison operators", () => {
  const check = (expr: string, expected: 0 | 1) =>
    it(`${expr} → ${expected}`, () => {
      const { output } = runProgram(`print(${expr});`);
      expect(output).toBe(String(expected));
    });

  check("1 == 1", 1);
  check("1 == 2", 0);
  check("1 != 2", 1);
  check("1 != 1", 0);
  check("2 < 3",  1);
  check("3 < 2",  0);
  check("3 < 3",  0);
  check("2 > 1",  1);
  check("1 > 2",  0);
  check("3 > 3",  0);
  check("2 <= 2", 1);
  check("2 <= 3", 1);
  check("3 <= 2", 0);
  check("2 >= 2", 1);
  check("3 >= 2", 1);
  check("1 >= 2", 0);

  it("comparison result used in if", () => {
    const { output } = runProgram(`
      int a = 5;
      int b = 3;
      if (a > b) { print(1); } else { print(0); }
    `);
    expect(output).toBe("1");
  });
});

// ============================================================
// 5. Logical operators
// ============================================================
describe("5. Boolean (logical) operators", () => {
  it("1 && 1 == 1", () => {
    const { output } = runProgram("print(1 && 1);");
    expect(output).toBe("1");
  });

  it("1 && 0 == 0", () => {
    const { output } = runProgram("print(1 && 0);");
    expect(output).toBe("0");
  });

  it("0 && 1 == 0", () => {
    const { output } = runProgram("print(0 && 1);");
    expect(output).toBe("0");
  });

  it("0 && 0 == 0", () => {
    const { output } = runProgram("print(0 && 0);");
    expect(output).toBe("0");
  });

  it("1 || 0 == 1", () => {
    const { output } = runProgram("print(1 || 0);");
    expect(output).toBe("1");
  });

  it("0 || 1 == 1", () => {
    const { output } = runProgram("print(0 || 1);");
    expect(output).toBe("1");
  });

  it("0 || 0 == 0", () => {
    const { output } = runProgram("print(0 || 0);");
    expect(output).toBe("0");
  });

  it("!0 == 1", () => {
    const { output } = runProgram("print(!0);");
    expect(output).toBe("1");
  });

  it("!1 == 0", () => {
    const { output } = runProgram("print(!1);");
    expect(output).toBe("0");
  });

  it("!(3 == 3) == 0", () => {
    const { output } = runProgram("print(!(3 == 3));");
    expect(output).toBe("0");
  });

  it("compound: (2 > 1) && (3 < 5) == 1", () => {
    const { output } = runProgram("print((2 > 1) && (3 < 5));");
    expect(output).toBe("1");
  });

  it("compound: (2 > 5) || (3 < 5) == 1", () => {
    const { output } = runProgram("print((2 > 5) || (3 < 5));");
    expect(output).toBe("1");
  });
});

// ============================================================
// 6. Unary operators
// ============================================================
describe("6. Unary operators", () => {
  it("unary minus on literal: -5", () => {
    const { output } = runProgram("print(-5);");
    expect(output).toBe("-5");
  });

  it("unary minus on variable", () => {
    const { output } = runProgram(`
      int x = 8;
      print(-x);
    `);
    expect(output).toBe("-8");
  });

  it("double negation: -(-3) = 3", () => {
    const { output } = runProgram("print(-(-3));");
    expect(output).toBe("3");
  });

  it("prefix increment: ++x", () => {
    const { output } = runProgram(`
      int x = 5;
      ++x;
      print(x);
    `);
    expect(output).toBe("6");
  });

  it("prefix decrement: --x", () => {
    const { output } = runProgram(`
      int x = 5;
      --x;
      print(x);
    `);
    expect(output).toBe("4");
  });

  it("postfix increment: x++ (x is updated)", () => {
    const { output } = runProgram(`
      int x = 10;
      x++;
      print(x);
    `);
    expect(output).toBe("11");
  });

  it("postfix decrement: x-- (x is updated)", () => {
    const { output } = runProgram(`
      int x = 10;
      x--;
      print(x);
    `);
    expect(output).toBe("9");
  });

  it("postfix increment returns old value", () => {
    const { output } = runProgram(`
      int x = 7;
      int old = x++;
      print(old);
      putc(' ');
      print(x);
    `);
    expect(output).toBe("7 8");
  });

  it("prefix increment returns new value", () => {
    const { output } = runProgram(`
      int x = 7;
      int nw = ++x;
      print(nw);
      putc(' ');
      print(x);
    `);
    expect(output).toBe("8 8");
  });
});

// ============================================================
// 7. Assignment operators (+=, -=)
// ============================================================
describe("7. Compound assignment operators", () => {
  it("x += 5", () => {
    const { output } = runProgram(`
      int x = 10;
      x += 5;
      print(x);
    `);
    expect(output).toBe("15");
  });

  it("x -= 3", () => {
    const { output } = runProgram(`
      int x = 10;
      x -= 3;
      print(x);
    `);
    expect(output).toBe("7");
  });

  it("chained +=", () => {
    const { output } = runProgram(`
      int s = 0;
      s += 1;
      s += 2;
      s += 3;
      print(s);
    `);
    expect(output).toBe("6");
  });

  it("array element +=", () => {
    const { output } = runProgram(`
      int arr[3];
      arr[0] = 10;
      arr[1] = 20;
      arr[0] += arr[1];
      print(arr[0]);
    `);
    expect(output).toBe("30");
  });

  it("array element -=", () => {
    const { output } = runProgram(`
      int arr[2];
      arr[0] = 100;
      arr[1] = 35;
      arr[0] -= arr[1];
      print(arr[0]);
    `);
    expect(output).toBe("65");
  });
});

// ============================================================
// 8. Control flow
// ============================================================
describe("8. Control flow — if/else", () => {
  it("if true branch", () => {
    const { output } = runProgram(`
      if (1 == 1) { print(1); } else { print(0); }
    `);
    expect(output).toBe("1");
  });

  it("if false branch (else)", () => {
    const { output } = runProgram(`
      if (1 == 2) { print(1); } else { print(0); }
    `);
    expect(output).toBe("0");
  });

  it("if without else — condition true", () => {
    const { output } = runProgram(`
      if (5 > 3) { print(42); }
    `);
    expect(output).toBe("42");
  });

  it("if without else — condition false, no output", () => {
    const { output } = runProgram(`
      if (3 > 5) { print(99); }
      print(0);
    `);
    expect(output).toBe("0");
  });

  it("nested if/else", () => {
    const src = `
      int x = 5;
      if (x < 0) {
        print(-1);
      } else {
        if (x == 0) {
          print(0);
        } else {
          print(1);
        }
      }
    `;
    expect(runProgram(src).output).toBe("1");
    expect(runProgram(src.replace("int x = 5;", "int x = 0;")).output).toBe("0");
    expect(runProgram(src.replace("int x = 5;", "int x = -3;")).output).toBe("-1");
  });
});

describe("8b. Control flow — while", () => {
  it("while loop 0..4", () => {
    const { output } = runProgram(`
      int i = 0;
      while (i < 5) {
        print(i);
        putc(' ');
        i = i + 1;
      }
    `);
    expect(output).toBe("0 1 2 3 4 ");
  });

  it("while loop not entered when condition false", () => {
    const { output } = runProgram(`
      int i = 10;
      while (i < 5) { print(i); i = i + 1; }
      print(99);
    `);
    expect(output).toBe("99");
  });

  it("while with break", () => {
    const { output } = runProgram(`
      int i = 0;
      while (i < 10) {
        if (i == 3) { break; }
        print(i);
        i = i + 1;
      }
    `);
    expect(output).toBe("012");
  });

  it("while with continue", () => {
    const { output } = runProgram(`
      int i = 0;
      while (i < 6) {
        i = i + 1;
        if (i == 3) { continue; }
        print(i);
      }
    `);
    // prints 1,2,4,5,6 (skips 3)
    expect(output).toBe("12456");
  });
});

describe("8c. Control flow — for", () => {
  it("classic for loop sum 1..5=15", () => {
    const { output } = runProgram(`
      int s = 0;
      for (int i = 1; i <= 5; i++) {
        s = s + i;
      }
      print(s);
    `);
    expect(output).toBe("15");
  });

  it("for with decrement", () => {
    const { output } = runProgram(`
      int main() {
        for (int i = 5; i >= 1; i--) {
          print(i);
          putc(' ');
        }
      }
    `);
    expect(output).toBe("5 4 3 2 1 ");
  });

  it("for with break", () => {
    const { output } = runProgram(`
      int s = 0;
      for (int i = 0; i < 100; i++) {
        if (i == 5) { break; }
        s = s + i;
      }
      print(s);
    `);
    // 0+1+2+3+4 = 10
    expect(output).toBe("10");
  });

  it("for with continue (sum of evens 0..8)", () => {
    const { output } = runProgram(`
      int s = 0;
      for (int i = 0; i < 10; i++) {
        if (i % 2 != 0) { continue; }
        s = s + i;
      }
      print(s);
    `);
    // 0+2+4+6+8 = 20
    expect(output).toBe("20");
  });

  it("nested for loops — multiplication table 1..3", () => {
    const { output } = runProgram(`
      int main() {
        for (int i = 1; i <= 3; i++) {
          for (int j = 1; j <= 3; j++) {
            print(i * j);
            putc(' ');
          }
          putc('\\n');
        }
      }
    `);
    expect(output).toBe("1 2 3 \n2 4 6 \n3 6 9 \n");
  });
});

// ============================================================
// 9. User-defined functions
// ============================================================
describe("9. User-defined functions", () => {
  it("function with no params returns constant", () => {
    const { output } = runProgram(`
      int answer() {
        return 42;
      }
      print(answer());
    `);
    expect(output).toBe("42");
  });

  it("function with one param", () => {
    const { output } = runProgram(`
      int double(int x) {
        return x + x;
      }
      print(double(7));
    `);
    expect(output).toBe("14");
  });

  it("function with two params", () => {
    const { output } = runProgram(`
      int add(int a, int b) {
        return a + b;
      }
      print(add(3, 4));
    `);
    expect(output).toBe("7");
  });

  it("function called multiple times", () => {
    const { output } = runProgram(`
      int square(int n) {
        return n * n;
      }
      print(square(2));
      putc(' ');
      print(square(3));
      putc(' ');
      print(square(4));
    `);
    expect(output).toBe("4 9 16");
  });

  it("function with conditional return", () => {
    const { output } = runProgram(`
      int abs_val(int x) {
        if (x < 0) {
          return -x;
        }
        return x;
      }
      print(abs_val(-5));
      putc(' ');
      print(abs_val(3));
    `);
    expect(output).toBe("5 3");
  });

  it("function with local variable", () => {
    const { output } = runProgram(`
      int triple(int x) {
        int t = x * 3;
        return t;
      }
      print(triple(6));
    `);
    expect(output).toBe("18");
  });

  it("function that uses while loop internally", () => {
    const { output } = runProgram(`
      int sum_to(int n) {
        int s = 0;
        int i = 1;
        while (i <= n) {
          s = s + i;
          i = i + 1;
        }
        return s;
      }
      print(sum_to(10));
    `);
    expect(output).toBe("55");
  });
});

// ============================================================
// 10. Arrays
// ============================================================
describe("10. Arrays", () => {
  it("write and read array element", () => {
    const { output } = runProgram(`
      int arr[5];
      arr[0] = 100;
      arr[1] = 200;
      arr[2] = 300;
      print(arr[0]);
      putc(' ');
      print(arr[1]);
      putc(' ');
      print(arr[2]);
    `);
    expect(output).toBe("100 200 300");
  });

  it("array default values are 0", () => {
    const { output } = runProgram(`
      int arr[3];
      print(arr[0]);
      print(arr[1]);
      print(arr[2]);
    `);
    expect(output).toBe("000");
  });

  it("array with variable index", () => {
    const { output } = runProgram(`
      int arr[5];
      int i = 0;
      while (i < 5) {
        arr[i] = i * 10;
        i = i + 1;
      }
      i = 0;
      while (i < 5) {
        print(arr[i]);
        putc(' ');
        i = i + 1;
      }
    `);
    expect(output).toBe("0 10 20 30 40 ");
  });

  it("array sum", () => {
    const { output } = runProgram(`
      int arr[5];
      arr[0] = 1;
      arr[1] = 2;
      arr[2] = 3;
      arr[3] = 4;
      arr[4] = 5;
      int s = 0;
      int i = 0;
      while (i < 5) {
        s = s + arr[i];
        i = i + 1;
      }
      print(s);
    `);
    expect(output).toBe("15");
  });

  it("array as string buffer (char array)", () => {
    const { output } = runProgram(`
      int buf[4];
      buf[0] = 'H';
      buf[1] = 'i';
      buf[2] = '!';
      buf[3] = '\\n';
      int i = 0;
      while (i < 4) {
        putc(buf[i]);
        i = i + 1;
      }
    `);
    expect(output).toBe("Hi!\n");
  });

  it("array element update via +=", () => {
    const { output } = runProgram(`
      int arr[3];
      arr[0] = 10;
      arr[0] += 5;
      print(arr[0]);
    `);
    expect(output).toBe("15");
  });
});

// ============================================================
// 11. I/O (getc, getn)
// ============================================================
describe("11. I/O — getc / getn", () => {
  it("getc reads and echoes a character", () => {
    const { output } = runProgram(`
      int c = getc();
      putc(c);
    `, "X");
    expect(output).toBe("X");
  });

  it("getc reads multiple characters", () => {
    const { output } = runProgram(`
      int a = getc();
      int b = getc();
      int c = getc();
      putc(c);
      putc(b);
      putc(a);
    `, "ABC");
    expect(output).toBe("CBA");
  });

  it("getn reads a positive integer", () => {
    const { output } = runProgram(`
      int n = getn();
      print(n);
    `, "42\n");
    expect(output).toBe("42");
  });

  it("getn reads zero", () => {
    const { output } = runProgram(`
      int n = getn();
      print(n);
    `, "0\n");
    expect(output).toBe("0");
  });

  it("getn arithmetic on input", () => {
    const { output } = runProgram(`
      int n = getn();
      print(n * 2);
    `, "7\n");
    expect(output).toBe("14");
  });

  it("getn reads two numbers and adds them", () => {
    const { output } = runProgram(`
      int a = getn();
      int b = getn();
      print(a + b);
    `, "12\n30\n");
    expect(output).toBe("42");
  });
});

// ============================================================
// 12. Complex programs
// ============================================================
describe("12. Complex programs", () => {
  it("sum 1..100 = 5050", () => {
    const { output } = runProgram(`
      int s = 0;
      for (int i = 1; i <= 100; i++) {
        s = s + i;
      }
      print(s);
    `);
    expect(output).toBe("5050");
  });

  it("max of two numbers", () => {
    const src = (a: number, b: number) => `
      int a = ${a};
      int b = ${b};
      int m;
      if (a > b) { m = a; } else { m = b; }
      print(m);
    `;
    expect(runProgram(src(3, 7)).output).toBe("7");
    expect(runProgram(src(9, 2)).output).toBe("9");
    expect(runProgram(src(5, 5)).output).toBe("5");
  });

  it("min of two numbers", () => {
    const src = (a: number, b: number) => `
      int a = ${a};
      int b = ${b};
      int m;
      if (a < b) { m = a; } else { m = b; }
      print(m);
    `;
    expect(runProgram(src(3, 7)).output).toBe("3");
    expect(runProgram(src(9, 2)).output).toBe("2");
  });

  it("factorial 5! = 120 (iterative)", () => {
    const { output } = runProgram(`
      int n = 5;
      int f = 1;
      int i = 2;
      while (i <= n) {
        f = f * i;
        i = i + 1;
      }
      print(f);
    `);
    expect(output).toBe("120");
  });

  it("factorial 10! = 3628800 (iterative)", () => {
    const { output } = runProgram(`
      int main() {
        int n = 10;
        int f = 1;
        for (int i = 2; i <= n; i++) {
          f = f * i;
        }
        print(f);
      }
    `);
    expect(output).toBe("3628800");
  });

  it("GCD via Euclidean algorithm", () => {
    const gcdSrc = (a: number, b: number) => `
      int a = ${a};
      int b = ${b};
      int t;
      while (b != 0) {
        t = b;
        b = a % b;
        a = t;
      }
      print(a);
    `;
    expect(runProgram(gcdSrc(48, 18)).output).toBe("6");
    expect(runProgram(gcdSrc(100, 25)).output).toBe("25");
    expect(runProgram(gcdSrc(17, 13)).output).toBe("1");
  });

  it("power function: 2^10 = 1024", () => {
    const { output } = runProgram(`
      int base = 2;
      int exp = 10;
      int result = 1;
      for (int i = 0; i < exp; i++) {
        result = result * base;
      }
      print(result);
    `);
    expect(output).toBe("1024");
  });

  it("count digits of 12345 = 5", () => {
    const { output } = runProgram(`
      int n = 12345;
      int count = 0;
      while (n > 0) {
        count = count + 1;
        n = n / 10;
      }
      print(count);
    `);
    expect(output).toBe("5");
  });

  it("reverse digits of 12345 → 54321", () => {
    const { output } = runProgram(`
      int n = 12345;
      int rev = 0;
      while (n > 0) {
        rev = rev * 10 + n % 10;
        n = n / 10;
      }
      print(rev);
    `);
    expect(output).toBe("54321");
  });

  it("prime check: is_prime(7)=1, is_prime(6)=0", () => {
    const primeSrc = (n: number) => `
      int n = ${n};
      int is_prime = 1;
      if (n < 2) { is_prime = 0; }
      int d = 2;
      while (d * d <= n) {
        if (n % d == 0) { is_prime = 0; }
        d = d + 1;
      }
      print(is_prime);
    `;
    expect(runProgram(primeSrc(7)).output).toBe("1");
    expect(runProgram(primeSrc(6)).output).toBe("0");
    expect(runProgram(primeSrc(2)).output).toBe("1");
    expect(runProgram(primeSrc(1)).output).toBe("0");
  });

  it("bubble sort 5 elements", () => {
    const { output } = runProgram(`
      int arr[5];
      arr[0] = 5;
      arr[1] = 3;
      arr[2] = 1;
      arr[3] = 4;
      arr[4] = 2;
      int n = 5;
      int i = 0;
      int j = 0;
      int tmp = 0;
      i = 0;
      while (i < n - 1) {
        j = 0;
        while (j < n - 1 - i) {
          if (arr[j] > arr[j+1]) {
            tmp = arr[j];
            arr[j] = arr[j+1];
            arr[j+1] = tmp;
          }
          j = j + 1;
        }
        i = i + 1;
      }
      int k = 0;
      while (k < n) {
        print(arr[k]);
        putc(' ');
        k = k + 1;
      }
    `, "", 5_000_000);
    expect(output).toBe("1 2 3 4 5 ");
  });

  it("count vowels in input string", () => {
    const { output } = runProgram(`
      int count = 0;
      int ch = getc();
      while (ch != '\\n') {
        if (ch == 'a' || ch == 'e' || ch == 'i' || ch == 'o' || ch == 'u') {
          count = count + 1;
        }
        ch = getc();
      }
      print(count);
    `, "hello world\n");
    // h(e)ll(o) w(o)rld → e, o, o = 3
    expect(output).toBe("3");
  });

  it("print all primes up to 20", () => {
    const { output } = runProgram(`
      int n = 2;
      while (n <= 20) {
        int is_prime = 1;
        int d = 2;
        while (d * d <= n) {
          if (n % d == 0) { is_prime = 0; }
          d = d + 1;
        }
        if (is_prime == 1) {
          print(n);
          putc(' ');
        }
        n = n + 1;
      }
    `, "", 1_000_000);
    expect(output).toBe("2 3 5 7 11 13 17 19 ");
  });

  it("function: factorial via loop", () => {
    const { output } = runProgram(`
      int fact(int n) {
        int f = 1;
        int i = 2;
        while (i <= n) {
          f = f * i;
          i = i + 1;
        }
        return f;
      }
      print(fact(1));
      putc(' ');
      print(fact(5));
      putc(' ');
      print(fact(7));
    `, "", 3_000_000);
    expect(output).toBe("1 120 5040");
  });

  it("function: max of two numbers (sequential calls)", () => {
    const { output } = runProgram(`
      int max2(int a, int b) {
        if (a > b) { return a; }
        return b;
      }
      print(max2(3, 7));
      putc(' ');
      print(max2(9, 2));
      putc(' ');
      print(max2(5, 5));
    `);
    expect(output).toBe("7 9 5");
  });
});

// ============================================================
// 13. Error cases (compile errors)
// ============================================================
describe("13. Compilation error cases", () => {
  it("syntax error: missing closing brace", () => {
    const result = compile("int main() { print(1);");
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("syntax error: missing semicolon", () => {
    const result = compile("int x = 5\nprint(x);");
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("syntax error: unmatched parenthesis", () => {
    const result = compile("print((1 + 2);");
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 14. VM execution guarantees
// ============================================================
describe("14. VM halts correctly", () => {
  it("empty main halts", () => {
    const { halted } = runProgram("int main() { return 0; }");
    expect(halted).toBe(true);
  });

  it("program with no main halts", () => {
    const { halted } = runProgram("print(1);");
    expect(halted).toBe(true);
  });

  it("while(0) loop never executes and halts", () => {
    const { output, halted } = runProgram(`
      while (0 == 1) { print(999); }
      print(0);
    `);
    expect(halted).toBe(true);
    expect(output).toBe("0");
  });
});
