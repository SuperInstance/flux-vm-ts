/**
 * FLUX Bytecode Decoder — byte array → human-readable assembly.
 */

import { Op, OP_NAMES } from "./opcodes";

export interface DecodedInstruction {
  offset: number;
  mnemonic: string;
  operands: string;
  size: number;
  opcode: number;
}

export function disassemble(bytecode: Uint8Array): DecodedInstruction[] {
  const instructions: DecodedInstruction[] = [];
  let offset = 0;

  while (offset < bytecode.length) {
    const startOffset = offset;
    const op = bytecode[offset];
    const name = OP_NAMES[op] ?? `UNKNOWN_0x${op.toString(16).padStart(2, "0")}`;
    offset++;

    const operands: string[] = [];

    // Decode based on opcode format
    switch (op) {
      case Op.NOP:
      case Op.HALT:
      case Op.RET:
      case Op.LEAVE:
        break;

      case Op.INC:
      case Op.DEC:
      case Op.INEG:
      case Op.INOT:
      case Op.PRINT:
        operands.push(`R${bytecode[offset]}`);
        offset++;
        break;

      case Op.MOV:
      case Op.LOAD:
      case Op.STORE:
        operands.push(`R${bytecode[offset]}`);
        offset++;
        operands.push(`R${bytecode[offset]}`);
        offset++;
        break;

      case Op.IADD: case Op.ISUB: case Op.IMUL: case Op.IDIV: case Op.IMOD:
      case Op.IAND: case Op.IOR: case Op.IXOR: case Op.ISHL: case Op.ISHR:
      case Op.ROTL: case Op.ROTR:
      case Op.FADD: case Op.FSUB: case Op.FMUL: case Op.FDIV:
      case Op.SCONCAT:
        operands.push(`R${bytecode[offset]}`);
        offset++;
        operands.push(`R${bytecode[offset]}`);
        offset++;
        operands.push(`R${bytecode[offset]}`);
        offset++;
        break;

      case Op.MOVI:
        operands.push(`R${bytecode[offset]}`);
        offset++;
        operands.push(`${bytecode[offset] | (bytecode[offset + 1] << 8)}`);
        offset += 2;
        break;

      case Op.CMP: case Op.ICMP:
      case Op.FEQ: case Op.FLT: case Op.FLE: case Op.FGT: case Op.FGE:
      case Op.SLEN: case Op.SCHAR: case Op.SSUB: case Op.SCMP:
        operands.push(`R${bytecode[offset]}`);
        offset++;
        operands.push(`R${bytecode[offset]}`);
        offset++;
        break;

      case Op.JZ: case Op.JNZ: case Op.JE: case Op.JNE: case Op.JL: case Op.JGE:
        operands.push(`R${bytecode[offset]}`);
        offset++;
        operands.push(`${bytecode[offset] | (bytecode[offset + 1] << 8)}`);
        offset += 2;
        break;

      case Op.JMP:
        operands.push(`${bytecode[offset] | (bytecode[offset + 1] << 8)}`);
        offset += 2;
        break;

      case Op.PUSH: case Op.POP:
        operands.push(`R${bytecode[offset]}`);
        offset++;
        break;

      case Op.DUP: case Op.SWAP: case Op.ENTER: case Op.ALLOCA:
        offset++;
        break;

      case Op.REGION_CREATE: case Op.REGION_DESTROY:
        operands.push(`R${bytecode[offset]}`);
        offset++;
        break;

      case Op.MEMCOPY: case Op.MEMSET: case Op.MEMCMP:
        operands.push(`R${bytecode[offset]}`);
        offset++;
        operands.push(`R${bytecode[offset]}`);
        offset++;
        offset++;
        break;

      case Op.CAST: case Op.BOX: case Op.UNBOX:
      case Op.CHECK_TYPE: case Op.CHECK_BOUNDS:
        operands.push(`R${bytecode[offset]}`);
        offset++;
        operands.push(`R${bytecode[offset]}`);
        offset++;
        break;

      case Op.FNEG: case Op.FABS: case Op.FMIN: case Op.FMAX:
        operands.push(`R${bytecode[offset]}`);
        offset++;
        operands.push(`R${bytecode[offset]}`);
        offset++;
        break;

      case Op.TELL: case Op.ASK: case Op.DELEGATE: case Op.BROADCAST:
      case Op.TRUST_CHECK: case Op.CAPABILITY_REQ:
        operands.push(`R${bytecode[offset]}`);
        offset++;
        operands.push(`R${bytecode[offset]}`);
        offset++;
        break;

      default:
        // Unknown — skip
        break;
    }

    instructions.push({
      offset: startOffset,
      mnemonic: name,
      operands: operands.join(", "),
      size: offset - startOffset,
      opcode: op,
    });
  }

  return instructions;
}

export function bytecodeToHex(bytecode: Uint8Array): string {
  return Array.from(bytecode)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

export function formatAssembly(instructions: DecodedInstruction[]): string {
  return instructions.map((i) => `  ${String(i.offset).padStart(4, "0")}:  ${i.mnemonic.padEnd(12)} ${i.operands}`).join("\n");
}
