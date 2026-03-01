// ============================================================
// Subleq Virtual Machine — 32-bit
//
// SUBLEQ instruction: mem[B] -= mem[A]; if mem[B] <= 0 then PC = C else PC += 3
//
// Negative Address Traps (C < 0):
//   -1 (0xFFFFFFFF): HALT — stop execution
//   -2 (0xFFFFFFFE): PUTC — output mem[A] as ASCII character, PC += 3
//   -3 (0xFFFFFFFD): GETC — read char, store in mem[A], PC += 3
//   -4 (0xFFFFFFFC): PUTN — output mem[A] as decimal number, PC += 3
//   -5 (0xFFFFFFFB): GETN — read decimal integer, store in mem[A], PC += 3
//
// For trap instructions, the subtraction is NOT performed.
// When GETC/GETN need input and the buffer is empty, PC is NOT advanced
// and the caller must provide input before retrying.
// ============================================================

import type { VMState } from "./types";

export const TRAP_HALT = -1;
export const TRAP_PUTC = -2;
export const TRAP_GETC = -3;
export const TRAP_PUTN = -4;
export const TRAP_GETN = -5;

export function createVM(binary: Int32Array, memorySize = 65536): VMState {
  const memory = new Int32Array(memorySize);
  // Load binary into memory starting at address 0
  for (let i = 0; i < binary.length && i < memorySize; i++) {
    memory[i] = binary[i];
  }

  return {
    memory,
    pc: 0,
    halted: false,
    output: "",
    inputBuffer: "",
    inputPos: 0,
    cycleCount: 0,
    memorySize,
  };
}

export function resetVM(vm: VMState, binary: Int32Array): void {
  vm.memory.fill(0);
  for (let i = 0; i < binary.length && i < vm.memorySize; i++) {
    vm.memory[i] = binary[i];
  }
  vm.pc = 0;
  vm.halted = false;
  vm.output = "";
  vm.inputBuffer = "";
  vm.inputPos = 0;
  vm.cycleCount = 0;
}

export interface StepResult {
  halted: boolean;
  outputChar?: string;
  outputNum?: number;
  needsInput?: boolean;
  error?: string;
  a: number;
  b: number;
  c: number;
  pc: number;
}

/** Execute a single SUBLEQ instruction */
export function step(vm: VMState): StepResult {
  if (vm.halted) {
    return { halted: true, a: 0, b: 0, c: 0, pc: vm.pc };
  }

  const pc = vm.pc;

  // Bounds check
  if (pc < 0 || pc + 2 >= vm.memorySize) {
    vm.halted = true;
    return {
      halted: true,
      error: `PC out of bounds: ${pc}`,
      a: 0, b: 0, c: 0, pc,
    };
  }

  const a = vm.memory[pc];      // address A
  const b = vm.memory[pc + 1];  // address B
  const c = vm.memory[pc + 2];  // address C (branch target)

  vm.cycleCount++;

  // Check for trap (negative C)
  if (c < 0) {
    switch (c) {
      case TRAP_HALT:
        vm.halted = true;
        return { halted: true, a, b, c, pc };

      case TRAP_PUTC: {
        // Output mem[A] as character, don't perform subtraction
        const charCode = a >= 0 && a < vm.memorySize ? vm.memory[a] : 0;
        const char = String.fromCharCode(charCode & 0xFFFF);
        vm.output += char;
        vm.pc += 3;
        return { halted: false, outputChar: char, a, b, c, pc };
      }

      case TRAP_GETC: {
        // Read character into mem[A]
        if (vm.inputPos < vm.inputBuffer.length) {
          const ch = vm.inputBuffer.charCodeAt(vm.inputPos);
          vm.inputPos++;
          if (a >= 0 && a < vm.memorySize) {
            vm.memory[a] = ch;
          }
          vm.pc += 3;
          return { halted: false, a, b, c, pc };
        } else {
          // No input available — block (don't advance PC)
          vm.cycleCount--; // don't count this as a real cycle
          return { halted: false, needsInput: true, a, b, c, pc };
        }
      }

      case TRAP_GETN: {
        // Read a decimal integer from input, store in mem[A]
        const buf = vm.inputBuffer;
        let pos = vm.inputPos;

        // Skip whitespace
        while (pos < buf.length && ' \t\n\r'.includes(buf[pos])) {
          pos++;
        }

        // Need more input?
        if (pos >= buf.length) {
          vm.inputPos = pos; // commit whitespace consumption
          vm.cycleCount--;
          return { halted: false, needsInput: true, a, b, c, pc };
        }

        // Read optional sign
        const signStart = pos;
        let sign = 1;
        if (buf[pos] === '-') { sign = -1; pos++; }
        else if (buf[pos] === '+') { pos++; }

        // Read digits
        let num = 0;
        let hasDigits = false;
        while (pos < buf.length && buf[pos] >= '0' && buf[pos] <= '9') {
          num = num * 10 + (buf.charCodeAt(pos) - 48);
          pos++;
          hasDigits = true;
        }

        if (!hasDigits) {
          if (pos >= buf.length) {
            // Sign consumed but no digits yet — need more input
            vm.inputPos = signStart; // restore: don't consume sign
            vm.cycleCount--;
            return { halted: false, needsInput: true, a, b, c, pc };
          }
          // Non-numeric char after optional sign — return 0
          num = 0;
          sign = 1;
          pos = signStart; // don't consume non-number
        }

        vm.inputPos = pos;
        if (a >= 0 && a < vm.memorySize) {
          vm.memory[a] = (sign * num) | 0;
        }
        vm.pc += 3;
        return { halted: false, a, b, c, pc };
      }

      case TRAP_PUTN: {
        // Output mem[A] as decimal number
        const num = a >= 0 && a < vm.memorySize ? vm.memory[a] : 0;
        const str = num.toString();
        vm.output += str;
        vm.pc += 3;
        return { halted: false, outputNum: num, a, b, c, pc };
      }

      default:
        vm.halted = true;
        return {
          halted: true,
          error: `Unknown trap: ${c}`,
          a, b, c, pc,
        };
    }
  }

  // Normal SUBLEQ: mem[B] -= mem[A]; if mem[B] <= 0 then PC = C else PC += 3
  if (a < 0 || a >= vm.memorySize || b < 0 || b >= vm.memorySize) {
    vm.halted = true;
    return {
      halted: true,
      error: `Address out of bounds: A=${a}, B=${b} (PC=${pc})`,
      a, b, c, pc,
    };
  }

  vm.memory[b] = (vm.memory[b] - vm.memory[a]) | 0; // 32-bit integer subtraction

  if (vm.memory[b] <= 0) {
    if (c < 0 || c >= vm.memorySize) {
      vm.halted = true;
      return {
        halted: true,
        error: `Branch target out of bounds: C=${c} (PC=${pc})`,
        a, b, c, pc,
      };
    }
    vm.pc = c;
  } else {
    vm.pc += 3;
  }

  return { halted: false, a, b, c, pc };
}

/** Run the VM for a given number of steps (or until halted / needs input) */
export function run(vm: VMState, maxSteps = 1000000): { halted: boolean; steps: number; needsInput?: boolean } {
  let steps = 0;
  let needsInput = false;
  while (!vm.halted && steps < maxSteps) {
    const result = step(vm);
    steps++;
    if (result.halted || result.error) break;
    if (result.needsInput) { needsInput = true; break; }
  }
  return { halted: vm.halted, steps, needsInput };
}

/** Format memory dump as hex (8-bit octets) */
export function formatMemoryDump(
  memory: Int32Array,
  startAddr: number,
  numWords: number
): string {
  const lines: string[] = [];
  const bytesPerLine = 16;
  const totalBytes = numWords * 4;

  for (let byteOff = 0; byteOff < totalBytes; byteOff += bytesPerLine) {
    const addr = (startAddr * 4 + byteOff).toString(16).toUpperCase().padStart(4, "0");
    const hexParts: string[] = [];
    const asciiParts: string[] = [];

    for (let i = 0; i < bytesPerLine; i++) {
      const globalByteIdx = byteOff + i;
      const wordIdx = startAddr + Math.floor(globalByteIdx / 4);
      const bytePos = globalByteIdx % 4;

      if (wordIdx < memory.length) {
        const word = memory[wordIdx];
        // Little-endian byte extraction
        const byte = (word >>> (bytePos * 8)) & 0xFF;
        hexParts.push(byte.toString(16).toUpperCase().padStart(2, "0"));
        asciiParts.push(byte >= 32 && byte < 127 ? String.fromCharCode(byte) : ".");
      } else {
        hexParts.push("  ");
        asciiParts.push(" ");
      }
    }

    // Group hex bytes with spaces
    const hex = hexParts.join(" ");
    lines.push(`${addr}: ${hex}`);
  }

  return lines.join("\n");
}

/** Format memory as 32-bit word dump */
export function formatWordDump(
  memory: Int32Array,
  startAddr: number,
  numWords: number
): string {
  const lines: string[] = [];
  const wordsPerLine = 4;

  for (let i = 0; i < numWords; i += wordsPerLine) {
    const addr = (startAddr + i).toString(16).toUpperCase().padStart(4, "0");
    const parts: string[] = [];

    for (let j = 0; j < wordsPerLine && (i + j) < numWords; j++) {
      const wordIdx = startAddr + i + j;
      if (wordIdx < memory.length) {
        const val = memory[wordIdx];
        // Show as unsigned hex
        parts.push((val >>> 0).toString(16).toUpperCase().padStart(8, "0"));
      }
    }

    lines.push(`${addr}: ${parts.join(" ")}`);
  }

  return lines.join("\n");
}

/** Get assembly-style view of memory around PC */
export function formatDisassembly(
  memory: Int32Array,
  pc: number,
  contextLines: number = 5,
  labels?: Map<string, number>
): string {
  const lines: string[] = [];
  const labelsByAddr = new Map<number, string>();
  if (labels) {
    for (const [name, addr] of labels) {
      if (!name.startsWith("__")) {
        labelsByAddr.set(addr, name);
      }
    }
  }

  const start = Math.max(0, pc - contextLines * 3);
  const end = Math.min(memory.length - 2, pc + contextLines * 3);

  for (let i = start; i < end; i += 3) {
    const label = labelsByAddr.get(i);
    if (label) {
      lines.push(`${label}:`);
    }

    const addr = i.toString(16).toUpperCase().padStart(4, "0");
    const a = memory[i], b = memory[i + 1], c = memory[i + 2];
    const marker = i === pc ? "►" : " ";
    lines.push(`${marker} ${addr}: SUBLEQ ${a} ${b} ${c}`);
  }

  return lines.join("\n");
}
