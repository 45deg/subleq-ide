// ============================================================
// Subleq Compiler — Peggy Parser Type Declarations
// ============================================================
import type { ProgramNode } from "./types";

export interface PeggyParseOptions {
  startRule?: string;
  grammarSource?: string;
}

export interface SyntaxError extends Error {
  location: {
    source?: string;
    start: { offset: number; line: number; column: number };
    end: { offset: number; line: number; column: number };
  };
  expected: Array<{ type: string; description: string }>;
  found: string | null;
}

export function parse(input: string, options?: PeggyParseOptions): ProgramNode;
export class SyntaxError extends Error {
  location: {
    source?: string;
    start: { offset: number; line: number; column: number };
    end: { offset: number; line: number; column: number };
  };
  expected: Array<{ type: string; description: string }>;
  found: string | null;
}
