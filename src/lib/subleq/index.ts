// Barrel export
export { compile } from "./pipeline";
export { parse as parseSrc } from "./parser-gen";
export { createVM, resetVM, step, run, formatMemoryDump, formatWordDump, formatDisassembly } from "./vm";
export { demoPrograms } from "./demos";
export type {
  VMState, CompilationResult, CompileError,
  MacroInstr, DemoProgram, ProgramNode,
} from "./types";
