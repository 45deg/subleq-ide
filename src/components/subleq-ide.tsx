import { useState, useCallback, useRef, useEffect } from "react";
import { compile, createVM, resetVM, step, run, formatMemoryDump, demoPrograms } from "@/lib/subleq";
import type { VMState, CompilationResult } from "@/lib/subleq";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ViewMode = "macro" | "pure";

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function SubleqIDE() {
  // ---- State ----
  const [source, setSource] = useState(demoPrograms[1].source); // FizzBuzz default
  const [selectedDemo, setSelectedDemo] = useState(demoPrograms[1].name);
  const [compilationResult, setCompilationResult] = useState<CompilationResult | null>(null);
  const [vm, setVm] = useState<VMState | null>(null);
  const [vmOutput, setVmOutput] = useState("");
  const [vmStatus, setVmStatus] = useState<"idle" | "running" | "halted" | "error">("idle");
  const [asmViewMode, setAsmViewMode] = useState<ViewMode>("pure");
  const [cycleCount, setCycleCount] = useState(0);
  const [pcDisplay, setPcDisplay] = useState(0);
  const [memDump, setMemDump] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [waitingForInput, setWaitingForInput] = useState(false);
  const [inputText, setInputText] = useState("");
  const runIntervalRef = useRef<number | null>(null);
  const wasRunningRef = useRef(false); // remember if Run was active when input was needed
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const asmScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mainLayoutRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<null | "left" | "right" | "console">(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(300);
  const [rightPanelWidth, setRightPanelWidth] = useState(320);
  const [consolePaneRatio, setConsolePaneRatio] = useState(0.45);

  // ---- Compile ----
  const handleCompile = useCallback(() => {
    // Stop any running execution
    if (runIntervalRef.current) {
      clearInterval(runIntervalRef.current);
      runIntervalRef.current = null;
      setIsRunning(false);
    }

    const result = compile(source);
    setCompilationResult(result);

    if (result.success && result.binary) {
      const newVM = createVM(result.binary);
      setVm(newVM);
      setVmOutput("");
      setVmStatus("idle");
      setCycleCount(0);
      setPcDisplay(0);
      setWaitingForInput(false);
      setInputText("");
      wasRunningRef.current = false;
      updateMemDump(newVM);
    } else {
      setVm(null);
      setVmOutput(result.errors.map(e => `[${e.phase}] Line ${e.line}: ${e.message}`).join("\n"));
      setVmStatus("error");
    }
  }, [source]);

  // ---- Step ----
  const handleStep = useCallback(() => {
    if (!vm || vm.halted) return;

    const result = step(vm);
    setVmOutput(vm.output);
    setCycleCount(vm.cycleCount);
    setPcDisplay(vm.pc);
    updateMemDump(vm);
    setVm({ ...vm });

    if (result.needsInput) {
      setWaitingForInput(true);
      setVmStatus("running");
      wasRunningRef.current = false; // was stepping, not running
      return;
    }
    if (result.halted) {
      setVmStatus("halted");
    }
    if (result.error) {
      setVmStatus("error");
      setVmOutput(prev => prev + `\n[ERROR] ${result.error}`);
    }
  }, [vm]);

  // ---- Run ----
  const handleRun = useCallback(() => {
    if (!vm || vm.halted) return;

    if (isRunning) {
      // Stop
      if (runIntervalRef.current) {
        clearInterval(runIntervalRef.current);
        runIntervalRef.current = null;
      }
      setIsRunning(false);
      return;
    }

    setIsRunning(true);
    setVmStatus("running");

    // Run in batches for responsiveness
    const batchSize = 5000;
    runIntervalRef.current = window.setInterval(() => {
      if (!vm || vm.halted) {
        if (runIntervalRef.current) {
          clearInterval(runIntervalRef.current);
          runIntervalRef.current = null;
        }
        setIsRunning(false);
        setVmStatus("halted");
        return;
      }

      const result = run(vm, batchSize);
      setVmOutput(vm.output);
      setCycleCount(vm.cycleCount);
      setPcDisplay(vm.pc);
      updateMemDump(vm);
      setVm({ ...vm });

      if (result.needsInput) {
        // Pause execution, wait for input
        if (runIntervalRef.current) {
          clearInterval(runIntervalRef.current);
          runIntervalRef.current = null;
        }
        setIsRunning(false);
        setWaitingForInput(true);
        wasRunningRef.current = true; // remember to resume after input
        return;
      }

      if (result.halted) {
        if (runIntervalRef.current) {
          clearInterval(runIntervalRef.current);
          runIntervalRef.current = null;
        }
        setIsRunning(false);
        setVmStatus("halted");
      }
    }, 16);
  }, [vm, isRunning]);

  // ---- Reset ----
  const handleReset = useCallback(() => {
    if (runIntervalRef.current) {
      clearInterval(runIntervalRef.current);
      runIntervalRef.current = null;
      setIsRunning(false);
    }

    if (compilationResult?.binary) {
      if (vm) {
        resetVM(vm, compilationResult.binary);
        setVm({ ...vm });
      } else {
        const newVM = createVM(compilationResult.binary);
        setVm(newVM);
      }
      setVmOutput("");
      setVmStatus("idle");
      setCycleCount(0);
      setPcDisplay(0);
      setWaitingForInput(false);
      setInputText("");
      wasRunningRef.current = false;
      if (vm) updateMemDump(vm);
    }
  }, [compilationResult, vm]);

  // ---- Demo selection ----
  const handleDemoSelect = useCallback((value: string) => {
    const demo = demoPrograms.find(d => d.name === value);
    if (demo) {
      setSelectedDemo(demo.name);
      setSource(demo.source);
      setCompilationResult(null);
      setVm(null);
      setVmOutput("");
      setVmStatus("idle");
      setCycleCount(0);
      setWaitingForInput(false);
      setInputText("");
      wasRunningRef.current = false;
    }
  }, []);

  // ---- Send Input ----
  const handleSendInput = useCallback(() => {
    if (!vm || !waitingForInput) return;
    const text = inputText;
    // Append input to VM's buffer (with newline)
    vm.inputBuffer += text + "\n";
    // Echo input in console output
    vm.output += text + "\n";
    setVmOutput(vm.output);
    setInputText("");
    setWaitingForInput(false);
    setVm({ ...vm });

    // If we were in Run mode, resume automatically
    if (wasRunningRef.current) {
      wasRunningRef.current = false;
      // Trigger run on next tick (state needs to settle)
      setTimeout(() => handleRun(), 0);
    }
  }, [vm, waitingForInput, inputText, handleRun]);

  // Auto-focus input field when waiting for input
  useEffect(() => {
    if (waitingForInput) {
      inputRef.current?.focus();
    }
  }, [waitingForInput]);

  // ---- Memory dump ----
  const updateMemDump = (vmState: VMState) => {
    const dump = formatMemoryDump(vmState.memory, 0, Math.min(256, vmState.memory.length));
    setMemDump(dump);
  };

  // Auto-scroll console
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [vmOutput]);

  // Cleanup interval
  useEffect(() => {
    return () => {
      if (runIntervalRef.current) {
        clearInterval(runIntervalRef.current);
      }
    };
  }, []);

  // ---- Pane resizing ----
  useEffect(() => {
    const minLeft = 220;
    const minRight = 240;
    const minMiddle = 280;
    const minConsole = 130;
    const minMemory = 130;

    const handleMouseMove = (event: MouseEvent) => {
      const dragType = dragStateRef.current;
      if (!dragType) return;

      if (dragType === "left" || dragType === "right") {
        const rect = mainLayoutRef.current?.getBoundingClientRect();
        if (!rect) return;

        if (dragType === "left") {
          const maxLeft = Math.max(minLeft, rect.width - rightPanelWidth - minMiddle);
          const nextWidth = clamp(event.clientX - rect.left, minLeft, maxLeft);
          setLeftPanelWidth(nextWidth);
          return;
        }

        const maxRight = Math.max(minRight, rect.width - leftPanelWidth - minMiddle);
        const nextWidth = clamp(rect.right - event.clientX, minRight, maxRight);
        setRightPanelWidth(nextWidth);
        return;
      }

      const rightRect = rightPanelRef.current?.getBoundingClientRect();
      if (!rightRect) return;
      const maxConsole = Math.max(minConsole, rightRect.height - minMemory);
      const nextConsoleHeight = clamp(event.clientY - rightRect.top, minConsole, maxConsole);
      setConsolePaneRatio(nextConsoleHeight / rightRect.height);
    };

    const stopDragging = () => {
      dragStateRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopDragging);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopDragging);
    };
  }, [leftPanelWidth, rightPanelWidth]);

  const startDragging = useCallback((type: "left" | "right" | "console") => {
    dragStateRef.current = type;
    document.body.style.userSelect = "none";
    document.body.style.cursor = type === "console" ? "row-resize" : "col-resize";
  }, []);

  // Get assembly text
  const assemblyText = compilationResult?.assemblyText ?? "";
  const macroText = compilationResult?.macroText ?? "";

  // ---- Status display ----
  const statusText = vmStatus === "idle" ? "IDLE" :
    waitingForInput ? "WAITING FOR INPUT" :
    vmStatus === "running" || isRunning ? "RUNNING" :
    vmStatus === "halted" ? `HALTED (PC: 0x${pcDisplay.toString(16).toUpperCase().padStart(2, "0")})` :
    "ERROR";

  const binarySize = compilationResult?.binary?.length ?? 0;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* ---- Header ---- */}
      <header className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold tracking-tight">⚙ Subleq Compiler & VM</span>
          <Badge variant="outline" className="text-[10px] font-normal">32-bit</Badge>
        </div>

        <Separator orientation="vertical" className="h-5" />

        {/* Demo selector */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Source Code</span>
          <Select value={selectedDemo} onValueChange={handleDemoSelect}>
            <SelectTrigger size="sm" className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {demoPrograms.map(d => (
                <SelectItem key={d.name} value={d.name}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1" />

        {/* Action buttons */}
        <div className="flex items-center gap-1.5">
          <Button size="sm" onClick={handleCompile} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <span className="text-xs">◇</span> Compile
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset} disabled={!compilationResult?.success}>
            ↻ Reset
          </Button>
          <Button size="sm" variant="outline" onClick={handleStep} disabled={!vm || vm.halted || isRunning}>
            ▷ Step
          </Button>
          <Button
            size="sm"
            onClick={handleRun}
            disabled={!vm || (vm.halted && !isRunning)}
            className={isRunning ? "bg-red-600 hover:bg-red-700 text-white" : "bg-sky-600 hover:bg-sky-700 text-white"}
          >
            {isRunning ? "■ Stop" : "▶ Run"}
          </Button>
        </div>
      </header>

      {/* ---- Main Layout ---- */}
      <div ref={mainLayoutRef} className="flex-1 flex overflow-hidden">
        {/* Left Panel — Source Code Editor */}
        <div style={{ width: leftPanelWidth }} className="flex flex-col border-r border-border shrink-0 min-w-0">
          <div className="px-3 py-1.5 border-b border-border bg-muted/30">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Source Code</span>
          </div>
          <div className="flex-1 relative">
            <textarea
              value={source}
              onChange={e => setSource(e.target.value)}
              className="absolute inset-0 w-full h-full bg-transparent resize-none p-3 text-[12px] leading-[1.6] focus:outline-none font-mono text-foreground placeholder:text-muted-foreground"
              spellCheck={false}
              placeholder="Enter C-like source code..."
            />
          </div>
          {/* Errors */}
          {compilationResult && !compilationResult.success && (
            <div className="border-t border-destructive/30 bg-destructive/5 px-3 py-2 max-h-[120px] overflow-y-auto">
              {compilationResult.errors.map((e, i) => (
                <div key={i} className="text-[11px] text-destructive">
                  [{e.phase}] L{e.line}:{e.col} — {e.message}
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          className="w-1.5 shrink-0 bg-border/60 hover:bg-primary/50 cursor-col-resize transition-colors"
          onMouseDown={() => startDragging("left")}
          onDoubleClick={() => setLeftPanelWidth(300)}
          title="Drag to resize source pane"
        />

        {/* Middle Panel — Assembly View */}
        <div className="flex-1 flex flex-col border-r border-border min-w-0">
          <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Assembly</span>
            <div className="flex items-center gap-0.5 ml-auto">
              <button
                onClick={() => setAsmViewMode("macro")}
                className={`px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors ${
                  asmViewMode === "macro"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Macro IR
              </button>
              <button
                onClick={() => setAsmViewMode("pure")}
                className={`px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors ${
                  asmViewMode === "pure"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Pure
              </button>
            </div>
          </div>
          <div ref={asmScrollRef} className="flex-1 overflow-auto font-mono text-[11px] leading-[1.6]">
            {compilationResult?.success ? (
              <pre className="p-3 whitespace-pre">
                {asmViewMode === "macro" ? (
                  <MacroView text={macroText} />
                ) : (
                  <AssemblyView text={assemblyText} pc={pcDisplay} binarySize={binarySize} />
                )}
              </pre>
            ) : (
              <div className="p-3 text-muted-foreground text-[11px]">
                Compile source code to view assembly output.
              </div>
            )}
          </div>
        </div>

        <div
          className="w-1.5 shrink-0 bg-border/60 hover:bg-primary/50 cursor-col-resize transition-colors"
          onMouseDown={() => startDragging("right")}
          onDoubleClick={() => setRightPanelWidth(320)}
          title="Drag to resize right pane"
        />

        {/* Right Panel — I/O Console + Memory */}
        <div ref={rightPanelRef} style={{ width: rightPanelWidth }} className="flex flex-col shrink-0 min-w-0">
          {/* I/O Console */}
          <div className="flex flex-col border-b border-border min-h-0" style={{ height: `${(consolePaneRatio * 100).toFixed(2)}%` }}>
            <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex items-center">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">I/O Console</span>
              <div className="ml-auto">
                <Badge
                  variant={waitingForInput ? "default" : vmStatus === "halted" ? "secondary" : vmStatus === "error" ? "destructive" : "outline"}
                  className={`text-[9px] h-4 ${waitingForInput ? "bg-amber-600 text-white animate-pulse" : ""}`}
                >
                  {statusText}
                </Badge>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-zinc-950 p-3">
              <pre className="text-emerald-400 text-[12px] leading-[1.5] whitespace-pre-wrap break-all font-mono">
                {vmOutput || (vmStatus === "idle" ? "" : "")}
              </pre>
              <div ref={consoleEndRef} />
            </div>
            {/* Input line */}
            {vm && !vm.halted && (
              <div className={`flex items-center border-t gap-0 ${waitingForInput ? "border-amber-600/50 bg-amber-950/20" : "border-border bg-zinc-950"}`}>
                <span className="text-emerald-500 text-[12px] font-mono pl-3 select-none">&gt;</span>
                <input
                  ref={inputRef}
                  type="text"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSendInput(); }}
                  disabled={!waitingForInput}
                  placeholder={waitingForInput ? "Type input and press Enter..." : ""}
                  className="flex-1 bg-transparent text-emerald-400 text-[12px] font-mono px-1.5 py-1.5 focus:outline-none placeholder:text-emerald-800 disabled:opacity-30"
                  spellCheck={false}
                />
                <button
                  onClick={handleSendInput}
                  disabled={!waitingForInput}
                  className="px-2 py-1.5 text-[10px] text-emerald-500 hover:text-emerald-300 disabled:opacity-20 font-medium"
                >
                  ⏎
                </button>
              </div>
            )}
            {vm && (
              <div className="px-3 py-1 border-t border-border bg-muted/30 flex items-center gap-3 text-[10px] text-muted-foreground">
                <span>Cycles: <span className="text-foreground font-medium">{cycleCount.toLocaleString()}</span></span>
                <span>PC: <span className="text-foreground font-medium">0x{pcDisplay.toString(16).toUpperCase().padStart(4, "0")}</span></span>
                <span>Words: <span className="text-foreground font-medium">{binarySize}</span></span>
              </div>
            )}
          </div>

          <div
            className="h-1.5 shrink-0 bg-border/60 hover:bg-primary/50 cursor-row-resize transition-colors"
            onMouseDown={() => startDragging("console")}
            onDoubleClick={() => setConsolePaneRatio(0.45)}
            title="Drag to resize console and memory"
          />

          {/* Memory Dump */}
          <div className="flex flex-col flex-1 min-h-0">
            <div className="px-3 py-1.5 border-b border-border bg-muted/30">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                ⬡ Memory Dump (Hex — 8bit Octets)
              </span>
            </div>
            <div className="flex-1 overflow-auto bg-zinc-950 p-3">
              <pre className="text-zinc-400 text-[10px] leading-[1.5] whitespace-pre font-mono">
                {memDump || "Compile and run to view memory."}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Sub-components for syntax highlighting ----

function MacroView({ text }: { text: string }) {
  if (!text) return <span className="text-muted-foreground">No macro output.</span>;

  return (
    <>
      {text.split("\n").map((line, i) => {
        const commentIdx = line.indexOf(";");
        const code = commentIdx >= 0 ? line.substring(0, commentIdx) : line;
        const comment = commentIdx >= 0 ? line.substring(commentIdx) : "";

        // Highlight op name
        const match = code.match(/^(\w+)(\s+)(.*)/);
        if (match) {
          return (
            <div key={i} className="hover:bg-muted/20">
              <span className="text-sky-400">{match[1]}</span>
              <span>{match[2]}</span>
              <span className="text-amber-300">{match[3]}</span>
              {comment && <span className="text-zinc-600">{comment}</span>}
            </div>
          );
        }
        return (
          <div key={i} className="hover:bg-muted/20">
            <span>{code}</span>
            {comment && <span className="text-zinc-600">{comment}</span>}
          </div>
        );
      })}
    </>
  );
}

function AssemblyView({ text, pc, binarySize }: { text: string; pc: number; binarySize: number }) {
  if (!text) return <span className="text-muted-foreground">No assembly output.</span>;

  return (
    <>
      <div className="text-zinc-600 mb-1 text-[10px]">; {binarySize} words emitted</div>
      {text.split("\n").map((line, i) => {
        // Label line
        if (line.endsWith(":")) {
          return (
            <div key={i} className="text-yellow-400/70 mt-1">
              {line}
            </div>
          );
        }

        // Instruction line: ADDR: SUBLEQ A B C
        const match = line.match(/^([0-9A-F]{4}): SUBLEQ (-?\d+) (-?\d+) (-?\d+)(.*)/);
        if (match) {
          const addr = parseInt(match[1], 16);
          const isPC = addr === pc;
          const comment = match[5] || "";
          return (
            <div key={i} className={`hover:bg-muted/20 ${isPC ? "bg-sky-900/30 text-sky-300" : ""}`}>
              <span className="text-zinc-600">{match[1]}: </span>
              <span className="text-violet-400">SUBLEQ </span>
              <span className="text-foreground">{match[2]} </span>
              <span className="text-foreground">{match[3]} </span>
              <span className={parseInt(match[4]) < 0 ? "text-red-400" : "text-foreground"}>
                {match[4]}
              </span>
              {comment && <span className="text-zinc-600">{comment}</span>}
            </div>
          );
        }

        return <div key={i}>{line}</div>;
      })}
    </>
  );
}

export default SubleqIDE;
