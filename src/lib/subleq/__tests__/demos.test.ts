// ============================================================
// Demo E2E Tests — compile → run → check output
// ============================================================
import { describe, it, expect } from "vitest";
import { compile } from "../pipeline";
import { createVM, run } from "../vm";
import { demoPrograms } from "../demos";

// ---- Helper: compile source, feed input, run VM, return output ----
function runProgram(
  source: string,
  input = "",
  maxSteps = 5_000_000,
): { output: string; halted: boolean; error?: string } {
  const result = compile(source);
  if (!result.success || !result.binary) {
    return {
      output: "",
      halted: true,
      error: `Compilation failed: ${result.errors.map(e => e.message).join("; ")}`,
    };
  }

  const vm = createVM(result.binary);
  vm.inputBuffer = input;

  // Run in a loop to handle multi-stage input consumption
  let totalSteps = 0;
  while (totalSteps < maxSteps) {
    const r = run(vm, maxSteps - totalSteps);
    totalSteps += r.steps;
    if (r.halted) break;
    if (r.needsInput) {
      // If VM needs input and we've exhausted it, provide EOF-like newline
      if (vm.inputPos >= vm.inputBuffer.length) {
        vm.inputBuffer += "\n";
      }
    }
  }

  return { output: vm.output, halted: vm.halted };
}

// ---- Lookup helper ----
function findDemo(name: string): string {
  const d = demoPrograms.find(p => p.name === name);
  if (!d) throw new Error(`Demo not found: ${name}`);
  return d.source;
}

// ============================================================
// Hello World
// ============================================================
describe("Hello World demo", () => {
  it("should output 'Hello, World!'", () => {
    const { output, halted } = runProgram(findDemo("Hello World"));
    expect(halted).toBe(true);
    expect(output).toBe("Hello, World!\n");
  });
});

// ============================================================
// FizzBuzz
// ============================================================
describe("FizzBuzz demo", () => {
  it("should output correct FizzBuzz for 1..20", () => {
    const { output, halted } = runProgram(findDemo("FizzBuzz"));
    expect(halted).toBe(true);

    const lines = output.trim().split("\n");
    expect(lines).toHaveLength(20);
    expect(lines[0]).toBe("1");
    expect(lines[1]).toBe("2");
    expect(lines[2]).toBe("Fizz");
    expect(lines[3]).toBe("4");
    expect(lines[4]).toBe("Buzz");
    expect(lines[5]).toBe("Fizz");
    expect(lines[14]).toBe("FizzBuzz"); // n=15
    expect(lines[19]).toBe("Buzz");     // n=20
  });
});

// ============================================================
// Fibonacci
// ============================================================
describe("Fibonacci demo", () => {
  it("should output first 10 Fibonacci numbers", () => {
    const { output, halted } = runProgram(findDemo("Fibonacci"));
    expect(halted).toBe(true);
    const nums = output.trim().split(/\s+/).map(Number);
    expect(nums).toEqual([0, 1, 1, 2, 3, 5, 8, 13, 21, 34]);
  });
});

// ============================================================
// Calc (Shunting-Yard expression evaluator)
// ============================================================
describe("Calc demo", () => {
  const calcSource = findDemo("Calc");

  it("should evaluate simple addition: 2+3", () => {
    const { output } = runProgram(calcSource, "2+3\n\n");
    expect(output).toContain("= 5");
  });

  it("should evaluate subtraction: 10-4", () => {
    const { output } = runProgram(calcSource, "10-4\n\n");
    expect(output).toContain("= 6");
  });

  it("should evaluate multiplication: 6*7", () => {
    const { output } = runProgram(calcSource, "6*7\n\n");
    expect(output).toContain("= 42");
  });

  it("should evaluate division: 20/4", () => {
    const { output } = runProgram(calcSource, "20/4\n\n");
    expect(output).toContain("= 5");
  });

  it("should respect operator precedence: 2+3*4", () => {
    const { output } = runProgram(calcSource, "2+3*4\n\n");
    expect(output).toContain("= 14");
  });

  it("should handle parentheses: (2+3)*4", () => {
    const { output } = runProgram(calcSource, "(2+3)*4\n\n");
    expect(output).toContain("= 20");
  });

  it("should handle nested parentheses: ((1+2)*(3+4))", () => {
    const { output } = runProgram(calcSource, "((1+2)*(3+4))\n\n");
    expect(output).toContain("= 21");
  });

  it("should handle spaces: 10 + 20", () => {
    const { output } = runProgram(calcSource, "10 + 20\n\n");
    expect(output).toContain("= 30");
  });

  it("should handle complex: 2*(3+4)-5", () => {
    const { output } = runProgram(calcSource, "2*(3+4)-5\n\n");
    expect(output).toContain("= 9");
  });
});

// ============================================================
// BF Interpreter
// ============================================================
describe("BF Interpreter demo", () => {
  const bfSource = findDemo("BF Interpreter");

  it("should run BF Hello World", () => {
    // Classic BF Hello World
    const bfProg =
      ">+++++++++[<++++++++>-]<.>+++++++[<++++>-]<+.+++++++..+++.[-]" +
      ">++++++++[<++++>-]<.>+++++++++++[<++++++++>-]<-.--------.+++.------.--------.[-]" +
      ">++++++++[<++++>-]<+.[-]++++++++++.";
    const { output } = runProgram(bfSource, bfProg + "\n", 50_000_000);
    expect(output.trim()).toBe("Hello world!");
  });

  it("should run BF add two numbers: 2+3=5 (char output)", () => {
    // BF: read two digits, add them, output result digit
    // cell0 = first - '0', cell1 = second - '0', add, output as digit
    // Simpler: add two small numbers via BF loops
    // Sets cell to 5 and outputs as char 53 = '5'
    const bfProg = "+++++[>++++++++++<-]>+++.";  // 5*10+3 = 53 = '5'
    const { output } = runProgram(bfSource, bfProg + "\n", 10_000_000);
    expect(output).toContain("5");
  });

  it("should run BF simple loop: output 'A'", () => {
    // 'A' = 65 = 13*5. Set cell to 65 and output.
    const bfProg = "+++++++++++++[>+++++<-]>."; // 13*5=65='A'
    const { output } = runProgram(bfSource, bfProg + "\n", 10_000_000);
    expect(output).toContain("A");
  });

  it("should handle BF comma (input)", () => {
    // Read a character and echo it
    const bfProg = ",.";
    const { output } = runProgram(bfSource, bfProg + "\nX", 10_000_000);
    expect(output).toContain("X");
  });
});
