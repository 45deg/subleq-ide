// ============================================================
// Demo Programs
// ============================================================
import type { DemoProgram } from "./types";

export const demoPrograms: DemoProgram[] = [
  {
    name: "Hello World",
    source: `// Hello World — SUBLEQ style
int main() {
  putc('H');
  putc('e');
  putc('l');
  putc('l');
  putc('o');
  putc(',');
  putc(' ');
  putc('W');
  putc('o');
  putc('r');
  putc('l');
  putc('d');
  putc('!');
  putc('\\n');
  return 0;
}
`,
  },
  {
    name: "FizzBuzz",
    source: `// FizzBuzz — classic interview problem
int n = 1;
int max = 20;
int mod3 = 1;
int mod5 = 1;
int is_fizz = 0;
int is_buzz = 0;

while (n <= max) {
    is_fizz = 0;
    is_buzz = 0;

    if (mod3 == 3) { is_fizz = 1; mod3 = 0; }
    if (mod5 == 5) { is_buzz = 1; mod5 = 0; }

    if (is_fizz == 1) { putc('F'); putc('i'); putc('z'); putc('z'); }
    if (is_buzz == 1) { putc('B'); putc('u'); putc('z'); putc('z'); }
    if (is_fizz == 0) {
        if (is_buzz == 0) { print(n); }
    }
    putc('\\n');

    n = n + 1;
    mod3 = mod3 + 1;
    mod5 = mod5 + 1;
}
`,
  },
  {
    name: "Calc",
    description: "Expression calculator with parentheses — e.g. (2+3)*4",
    source: `// Expression Calculator (Shunting-Yard algorithm)
// Supports: + - * / and parentheses ()
// Type an expression then Enter. E.g.: (2+3)*4
// Empty line to quit.

int vals[32];
int ops[32];
int vsp;
int osp;
int ch;
int num;
int has_num;
int a;
int b;
int op;
int p1;
int p2;
int is_op;

while (1) {
    putc('>');
    putc(' ');
    vsp = 0;
    osp = 0;
    has_num = 0;
    num = 0;

    ch = getc();
    if (ch == '\\n') { break; }

    while (ch != '\\n') {
        // Skip spaces
        if (ch == ' ') {
            if (has_num == 1) {
                vals[vsp] = num;
                vsp = vsp + 1;
                num = 0;
                has_num = 0;
            }
            ch = getc();
            continue;
        }

        // Digit — accumulate number
        if (ch >= '0') {
            if (ch <= '9') {
                num = num * 10 + ch - 48;
                has_num = 1;
                ch = getc();
                continue;
            }
        }

        // Flush pending number before operator / paren
        if (has_num == 1) {
            vals[vsp] = num;
            vsp = vsp + 1;
            num = 0;
            has_num = 0;
        }

        // Left parenthesis
        if (ch == '(') {
            ops[osp] = ch;
            osp = osp + 1;
            ch = getc();
            continue;
        }

        // Right parenthesis — pop until matching '('
        if (ch == ')') {
            while (osp > 0) {
                if (ops[osp - 1] == '(') { break; }
                osp = osp - 1;
                op = ops[osp];
                vsp = vsp - 1;
                b = vals[vsp];
                vsp = vsp - 1;
                a = vals[vsp];
                if (op == '+') { a = a + b; }
                if (op == '-') { a = a - b; }
                if (op == '*') { a = a * b; }
                if (op == '/') { a = a / b; }
                vals[vsp] = a;
                vsp = vsp + 1;
            }
            if (osp > 0) { osp = osp - 1; }
            ch = getc();
            continue;
        }

        // Operator?
        is_op = 0;
        if (ch == '+') { is_op = 1; }
        if (ch == '-') { is_op = 1; }
        if (ch == '*') { is_op = 1; }
        if (ch == '/') { is_op = 1; }

        if (is_op == 1) {
            // Precedence of current operator
            p1 = 1;
            if (ch == '*') { p1 = 2; }
            if (ch == '/') { p1 = 2; }

            // Pop higher-or-equal precedence operators
            while (osp > 0) {
                op = ops[osp - 1];
                if (op == '(') { break; }
                p2 = 1;
                if (op == '*') { p2 = 2; }
                if (op == '/') { p2 = 2; }
                if (p2 < p1) { break; }

                osp = osp - 1;
                vsp = vsp - 1;
                b = vals[vsp];
                vsp = vsp - 1;
                a = vals[vsp];
                if (op == '+') { a = a + b; }
                if (op == '-') { a = a - b; }
                if (op == '*') { a = a * b; }
                if (op == '/') { a = a / b; }
                vals[vsp] = a;
                vsp = vsp + 1;
            }

            ops[osp] = ch;
            osp = osp + 1;
        }

        ch = getc();
    }

    // Flush trailing number
    if (has_num == 1) {
        vals[vsp] = num;
        vsp = vsp + 1;
    }

    // Apply remaining operators
    while (osp > 0) {
        osp = osp - 1;
        op = ops[osp];
        if (op == '(') { continue; }
        vsp = vsp - 1;
        b = vals[vsp];
        vsp = vsp - 1;
        a = vals[vsp];
        if (op == '+') { a = a + b; }
        if (op == '-') { a = a - b; }
        if (op == '*') { a = a * b; }
        if (op == '/') { a = a / b; }
        vals[vsp] = a;
        vsp = vsp + 1;
    }

    if (vsp > 0) {
        putc('=');
        putc(' ');
        print(vals[0]);
        putc('\\n');
    }
}
`,
  },
  {
    name: "BF Interpreter",
    description: "Brainfuck interpreter — paste BF code on the first line",
    source: `// Brainfuck Interpreter
// First line of input : BF program source
// Remaining input     : stdin for the BF program
//
// Example — paste this BF Hello World then press Enter:
//   +++++++++[>++++++++<-]>.

int prog[512];
int tape[512];
int plen;
int pc;
int dp;
int ch;
int depth;

// ---- Read BF program (first line) ----
plen = 0;
ch = getc();
while (ch != '\\n') {
    prog[plen] = ch;
    plen = plen + 1;
    ch = getc();
}

// ---- Execute ----
pc = 0;
dp = 0;

while (pc < plen) {
    ch = prog[pc];

    if (ch == '>') { dp = dp + 1; }
    if (ch == '<') { dp = dp - 1; }
    if (ch == '+') { tape[dp] += 1; }
    if (ch == '-') { tape[dp] -= 1; }
    if (ch == '.') { putc(tape[dp]); }
    if (ch == ',') { tape[dp] = getc(); }

    // [ — jump forward to matching ] if cell is zero
    if (ch == '[') {
        if (tape[dp] == 0) {
            depth = 1;
            while (depth > 0) {
                pc = pc + 1;
                if (prog[pc] == '[') { depth = depth + 1; }
                if (prog[pc] == ']') { depth = depth - 1; }
            }
        }
    }

    // ] — jump back to matching [ if cell is non-zero
    if (ch == ']') {
        if (tape[dp] != 0) {
            depth = 1;
            while (depth > 0) {
                pc = pc - 1;
                if (prog[pc] == ']') { depth = depth + 1; }
                if (prog[pc] == '[') { depth = depth - 1; }
            }
        }
    }

    pc = pc + 1;
}
putc('\\n');
`,
  },
  {
    name: "Fibonacci",
    source: `// Fibonacci numbers
int a = 0;
int b = 1;
int temp = 0;
int count = 0;

while (count < 10) {
    print(a);
    putc(' ');
    temp = a + b;
    a = b;
    b = temp;
    count = count + 1;
}
putc('\\n');
`,
  },
  {
    name: "Function Calls",
    source: `// Function Calls
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
`,
  }
];
