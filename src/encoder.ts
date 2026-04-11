/**
 * FLUX Bytecode Encoder — Assembly text → byte array.
 * Supports register ops (IADD R0, R1, R2), immediate ops (MOVI R0, 42),
 * and jump ops (JZ R0, label / JMP label).
 */

import { Op } from "./opcodes";

export interface EncodedInstruction {
  offset: number;
  opcode: number;
  operands: number[];
  size: number;
  mnemonic: string;
}

export function encodeAssembly(assembly: string): {
  bytecode: Uint8Array;
  instructions: EncodedInstruction[];
  labels: Map<string, number>;
} {
  const lines = assembly.split("\n");
  const labels = new Map<string, number>();
  const rawLines: { line: string; lineNum: number }[] = [];
  const instructions: EncodedInstruction[] = [];

  // First pass: collect labels and lines
  let idx = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("--") || trimmed.startsWith("//")) continue;

    // Label detection
    if (trimmed.endsWith(":")) {
      const labelName = trimmed.slice(0, -1).trim();
      labels.set(labelName, idx);
      continue;
    }

    rawLines.push({ line: trimmed, lineNum: i });
    idx++;
  }

  // Second pass: encode
  const bytes: number[] = [];
  for (const { line } of rawLines) {
    const offset = bytes.length;
    const encoded = encodeLine(line, labels);
    bytes.push(...encoded.bytes);
    instructions.push({
      offset,
      opcode: encoded.bytes[0] ?? 0,
      operands: encoded.operands,
      size: encoded.bytes.length,
      mnemonic: encoded.mnemonic,
    });
  }

  // Third pass: resolve forward jump labels
  // (simple two-pass: we already have labels from first pass)
  return {
    bytecode: new Uint8Array(bytes),
    instructions,
    labels,
  };
}

interface LineEncode {
  bytes: number[];
  operands: number[];
  mnemonic: string;
}

function parseReg(s: string): number {
  const m = s.trim().match(/^R(\d+)$/i);
  if (!m) throw new Error(`Invalid register: ${s}`);
  return parseInt(m[1]);
}

function parseImm(s: string): number {
  return parseInt(s.trim());
}

function encodeLine(line: string, labels: Map<string, number>): LineEncode {
  const parts = line.split(/[\s,]+/).filter(Boolean);
  const mnemonic = parts[0].toUpperCase();
  const args = parts.slice(1).join(",").split(",").map((s) => s.trim());

  // Map mnemonic to opcode
  const opcodeMap: Record<string, Op> = {};
  for (const [name, code] of Object.entries(Op)) {
    opcodeMap[name] = code as Op;
  }

  const op = opcodeMap[mnemonic];
  if (op === undefined) {
    // Treat unknown as NOP
    return { bytes: [Op.NOP], operands: [], mnemonic: "NOP" };
  }

  switch (op) {
    // Zero-operand instructions
    case Op.NOP:
    case Op.HALT:
    case Op.RET:
    case Op.LEAVE:
      return { bytes: [op], operands: [], mnemonic };

    // Single register: INC R0, DEC R0, INEG R0, NOT R0
    case Op.INC:
    case Op.DEC:
    case Op.INEG:
    case Op.INOT:
    case Op.PRINT: {
      const r = parseReg(args[0]);
      return { bytes: [op, r], operands: [r], mnemonic };
    }

    // Two registers: MOV Rd, Rs
    case Op.MOV:
    case Op.LOAD:
    case Op.STORE: {
      const rd = parseReg(args[0]);
      const rs = parseReg(args[1]);
      return { bytes: [op, rd, rs], operands: [rd, rs], mnemonic };
    }

    // Three registers: IADD Rd, Ra, Rb
    case Op.IADD:
    case Op.ISUB:
    case Op.IMUL:
    case Op.IDIV:
    case Op.IMOD:
    case Op.IAND:
    case Op.IOR:
    case Op.IXOR:
    case Op.ISHL:
    case Op.ISHR:
    case Op.ROTL:
    case Op.ROTR:
    case Op.FADD:
    case Op.FSUB:
    case Op.FMUL:
    case Op.FDIV:
    case Op.SCONCAT: {
      const rd = parseReg(args[0]);
      const ra = parseReg(args[1]);
      const rb = args.length > 2 ? parseReg(args[2]) : 0;
      return { bytes: [op, rd, ra, rb], operands: [rd, ra, rb], mnemonic };
    }

    // Immediate load: MOVI R0, 42
    case Op.MOVI: {
      const r = parseReg(args[0]);
      const imm = parseImm(args[1]);
      return { bytes: [op, r, imm & 0xff, (imm >> 8) & 0xff], operands: [r, imm], mnemonic };
    }

    // Comparison: CMP Ra, Rb
    case Op.CMP:
    case Op.ICMP:
    case Op.FEQ:
    case Op.FLT:
    case Op.FLE:
    case Op.FGT:
    case Op.FGE:
    case Op.SLEN:
    case Op.SCHAR:
    case Op.SSUB:
    case Op.SCMP: {
      const ra = parseReg(args[0]);
      const rb = args.length > 1 ? parseReg(args[1]) : 0;
      return { bytes: [op, ra, rb], operands: [ra, rb], mnemonic };
    }

    // Conditional jumps: JZ R0, label
    case Op.JZ:
    case Op.JNZ:
    case Op.JE:
    case Op.JNE:
    case Op.JL:
    case Op.JGE: {
      const r = parseReg(args[0]);
      const target = args[1];
      const addr = labels.get(target) ?? parseImm(target);
      return { bytes: [op, r, addr & 0xff, (addr >> 8) & 0xff], operands: [r, addr], mnemonic };
    }

    // Unconditional jump: JMP label
    case Op.JMP: {
      const target = args[0];
      const addr = labels.get(target) ?? parseImm(target);
      return { bytes: [op, addr & 0xff, (addr >> 8) & 0xff], operands: [addr], mnemonic };
    }

    // Stack ops
    case Op.PUSH:
    case Op.POP: {
      const r = args.length > 0 ? parseReg(args[0]) : 0;
      return { bytes: [op, r], operands: [r], mnemonic };
    }

    case Op.DUP:
    case Op.SWAP:
    case Op.ENTER:
    case Op.ALLOCA:
      return { bytes: [op, 0], operands: [0], mnemonic };

    // Memory ops
    case Op.REGION_CREATE:
    case Op.REGION_DESTROY: {
      const r = args.length > 0 ? parseReg(args[0]) : 0;
      return { bytes: [op, r], operands: [r], mnemonic };
    }

    case Op.MEMCOPY:
    case Op.MEMSET:
    case Op.MEMCMP: {
      const a = parseReg(args[0]);
      const b = parseReg(args[1]);
      const c = args.length > 2 ? parseReg(args[2]) : 0;
      return { bytes: [op, a, b, c], operands: [a, b, c], mnemonic };
    }

    // Type ops
    case Op.CAST:
    case Op.BOX:
    case Op.UNBOX:
    case Op.CHECK_TYPE:
    case Op.CHECK_BOUNDS: {
      const a = parseReg(args[0]);
      const b = args.length > 1 ? parseReg(args[1]) : 0;
      return { bytes: [op, a, b], operands: [a, b], mnemonic };
    }

    // Float unary
    case Op.FNEG:
    case Op.FABS:
    case Op.FMIN:
    case Op.FMAX: {
      const a = parseReg(args[0]);
      const b = args.length > 1 ? parseReg(args[1]) : 0;
      return { bytes: [op, a, b], operands: [a, b], mnemonic };
    }

    // A2A protocol
    case Op.TELL:
    case Op.ASK:
    case Op.DELEGATE:
    case Op.BROADCAST:
    case Op.TRUST_CHECK:
    case Op.CAPABILITY_REQ: {
      const a = parseReg(args[0]);
      const b = args.length > 1 ? parseReg(args[1]) : 0;
      return { bytes: [op, a, b], operands: [a, b], mnemonic };
    }

    default:
      return { bytes: [op], operands: [], mnemonic };
  }
}

/** Encode a simple instruction sequence and return executable bytecode. */
export function quickEncode(assembly: string): Uint8Array {
  const result = encodeAssembly(assembly);
  return result.bytecode;
}
