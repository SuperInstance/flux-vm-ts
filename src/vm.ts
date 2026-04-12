/**
 * FLUX Virtual Machine — 64-register, stack-based interpreter.
 * All languages compile to this universal bytecode engine.
 */

import { Op } from "./opcodes";
import { DecodedInstruction, disassemble, formatAssembly } from "./decoder";
import { encodeAssembly } from "./encoder";

export interface VMState {
  registers: number[];
  flags: { zero: boolean; negative: boolean; carry: boolean; overflow: boolean };
  stack: number[];
  pc: number;
  halted: boolean;
  cycles: number;
  error: string | null;
}

export interface ExecutionResult {
  success: boolean;
  result: number;
  registers: number[];
  cycles: number;
  disassembly: string;
  error: string | null;
  halted: boolean;
  trace: string[];
}

export class FluxVM {
  private regs: number[] = new Array(64).fill(0);
  private flags = { zero: false, negative: false, carry: false, overflow: false };
  private stack: number[] = [];
  private pc = 0;
  private bytecode: Uint8Array;
  private cycles = 0;
  private maxCycles: number;
  private halted = false;
  private error: string | null = null;
  private trace: string[] = [];
  private traceEnabled: boolean;

  constructor(bytecode: Uint8Array, options?: { maxCycles?: number; trace?: boolean }) {
    this.bytecode = bytecode;
    this.maxCycles = options?.maxCycles ?? 1_000_000;
    this.traceEnabled = options?.trace ?? false;
  }

  getState(): VMState {
    return {
      registers: [...this.regs],
      flags: { ...this.flags },
      stack: [...this.stack],
      pc: this.pc,
      halted: this.halted,
      cycles: this.cycles,
      error: this.error,
    };
  }

  readReg(r: number): number {
    return this.regs[r] ?? 0;
  }

  writeReg(r: number, val: number) {
    if (r >= 0 && r < 64) {
      this.regs[r] = val | 0; // 32-bit int
    }
  }

  private push(val: number) {
    this.stack.push(val);
  }

  private pop(): number {
    return this.stack.pop() ?? 0;
  }

  private updateFlags(result: number) {
    this.flags.zero = result === 0;
    this.flags.negative = result < 0;
  }

  private readU16(offset: number): number {
    return this.bytecode[offset] | (this.bytecode[offset + 1] << 8);
  }

  private log(msg: string) {
    if (this.traceEnabled) {
      this.trace.push(msg);
    }
  }

  execute(): ExecutionResult {
    const disasm = disassemble(this.bytecode);
    const disasmStr = formatAssembly(disasm);

    while (this.pc < this.bytecode.length && !this.halted && this.cycles < this.maxCycles) {
      const op = this.bytecode[this.pc];
      this.cycles++;

      switch (op) {
        case Op.NOP:
          this.pc++;
          break;

        case Op.MOV: {
          const rd = this.bytecode[this.pc + 1];
          const rs = this.bytecode[this.pc + 2];
          this.writeReg(rd, this.readReg(rs));
          this.pc += 3;
          break;
        }

        case Op.LOAD: {
          const rd = this.bytecode[this.pc + 1];
          const rs = this.bytecode[this.pc + 2];
          this.writeReg(rd, this.readReg(rs));
          this.pc += 3;
          break;
        }

        case Op.STORE: {
          const rd = this.bytecode[this.pc + 1];
          const rs = this.bytecode[this.pc + 2];
          this.writeReg(rs, this.readReg(rd));
          this.pc += 3;
          break;
        }

        case Op.MOVI: {
          const r = this.bytecode[this.pc + 1];
          const imm = this.readU16(this.pc + 2);
          // Handle signed 16-bit
          const val = imm > 32767 ? imm - 65536 : imm;
          this.writeReg(r, val);
          this.updateFlags(val);
          this.pc += 4;
          break;
        }

        // Arithmetic
        case Op.IADD: {
          const rd = this.bytecode[this.pc + 1];
          const ra = this.bytecode[this.pc + 2];
          const rb = this.bytecode[this.pc + 3];
          const result = this.readReg(ra) + this.readReg(rb);
          this.writeReg(rd, result);
          this.updateFlags(result);
          this.pc += 4;
          break;
        }

        case Op.ISUB: {
          const rd = this.bytecode[this.pc + 1];
          const ra = this.bytecode[this.pc + 2];
          const rb = this.bytecode[this.pc + 3];
          const result = this.readReg(ra) - this.readReg(rb);
          this.writeReg(rd, result);
          this.updateFlags(result);
          this.pc += 4;
          break;
        }

        case Op.IMUL: {
          const rd = this.bytecode[this.pc + 1];
          const ra = this.bytecode[this.pc + 2];
          const rb = this.bytecode[this.pc + 3];
          const result = this.readReg(ra) * this.readReg(rb);
          this.writeReg(rd, result);
          this.updateFlags(result);
          this.pc += 4;
          break;
        }

        case Op.IDIV: {
          const rd = this.bytecode[this.pc + 1];
          const ra = this.bytecode[this.pc + 2];
          const rb = this.bytecode[this.pc + 3];
          const divisor = this.readReg(rb);
          if (divisor === 0) {
            this.error = "Division by zero";
            this.halted = true;
            break;
          }
          const result = Math.trunc(this.readReg(ra) / divisor);
          this.writeReg(rd, result);
          this.updateFlags(result);
          this.pc += 4;
          break;
        }

        case Op.IMOD: {
          const rd = this.bytecode[this.pc + 1];
          const ra = this.bytecode[this.pc + 2];
          const rb = this.bytecode[this.pc + 3];
          const divisor = this.readReg(rb);
          if (divisor === 0) {
            this.error = "Modulo by zero";
            this.halted = true;
            break;
          }
          const result = this.readReg(ra) % divisor;
          this.writeReg(rd, result);
          this.updateFlags(result);
          this.pc += 4;
          break;
        }

        case Op.INEG: {
          const r = this.bytecode[this.pc + 1];
          const result = -this.readReg(r);
          this.writeReg(r, result);
          this.updateFlags(result);
          this.pc += 2;
          break;
        }

        case Op.INC: {
          const r = this.bytecode[this.pc + 1];
          const result = this.readReg(r) + 1;
          this.writeReg(r, result);
          this.updateFlags(result);
          this.pc += 2;
          break;
        }

        case Op.DEC: {
          const r = this.bytecode[this.pc + 1];
          const result = this.readReg(r) - 1;
          this.writeReg(r, result);
          this.updateFlags(result);
          this.pc += 2;
          break;
        }

        // Comparison
        case Op.CMP: {
          const ra = this.bytecode[this.pc + 1];
          const rb = this.bytecode[this.pc + 2];
          const diff = this.readReg(ra) - this.readReg(rb);
          this.updateFlags(diff);
          this.pc += 3;
          break;
        }

        case Op.ICMP: {
          const ra = this.bytecode[this.pc + 1];
          const rb = this.bytecode[this.pc + 2];
          const a = this.readReg(ra);
          const b = this.readReg(rb);
          // Store comparison result: -1, 0, or 1
          this.flags.zero = a === b;
          this.flags.negative = a < b;
          this.pc += 3;
          break;
        }

        // Bitwise
        case Op.IAND: {
          const rd = this.bytecode[this.pc + 1];
          const ra = this.bytecode[this.pc + 2];
          const rb = this.bytecode[this.pc + 3];
          this.writeReg(rd, this.readReg(ra) & this.readReg(rb));
          this.pc += 4;
          break;
        }

        case Op.IOR: {
          const rd = this.bytecode[this.pc + 1];
          const ra = this.bytecode[this.pc + 2];
          const rb = this.bytecode[this.pc + 3];
          this.writeReg(rd, this.readReg(ra) | this.readReg(rb));
          this.pc += 4;
          break;
        }

        case Op.IXOR: {
          const rd = this.bytecode[this.pc + 1];
          const ra = this.bytecode[this.pc + 2];
          const rb = this.bytecode[this.pc + 3];
          this.writeReg(rd, this.readReg(ra) ^ this.readReg(rb));
          this.pc += 4;
          break;
        }

        case Op.INOT: {
          const r = this.bytecode[this.pc + 1];
          this.writeReg(r, ~this.readReg(r));
          this.pc += 2;
          break;
        }

        case Op.ISHL: {
          const rd = this.bytecode[this.pc + 1];
          const ra = this.bytecode[this.pc + 2];
          const rb = this.bytecode[this.pc + 3];
          this.writeReg(rd, this.readReg(ra) << this.readReg(rb));
          this.pc += 4;
          break;
        }

        case Op.ISHR: {
          const rd = this.bytecode[this.pc + 1];
          const ra = this.bytecode[this.pc + 2];
          const rb = this.bytecode[this.pc + 3];
          this.writeReg(rd, this.readReg(ra) >> this.readReg(rb));
          this.pc += 4;
          break;
        }

        // Jumps
        case Op.JMP: {
          const addr = this.readU16(this.pc + 1);
          this.pc = addr;
          break;
        }

        case Op.JZ: {
          const r = this.bytecode[this.pc + 1];
          const addr = this.readU16(this.pc + 2);
          if (this.readReg(r) === 0) this.pc = addr;
          else this.pc += 4;
          break;
        }

        case Op.JNZ: {
          const r = this.bytecode[this.pc + 1];
          const addr = this.readU16(this.pc + 2);
          if (this.readReg(r) !== 0) this.pc = addr;
          else this.pc += 4;
          break;
        }

        case Op.JE: {
          const addr = this.readU16(this.pc + 2);
          if (this.flags.zero) this.pc = addr;
          else this.pc += 4;
          break;
        }

        case Op.JNE: {
          const addr = this.readU16(this.pc + 2);
          if (!this.flags.zero) this.pc = addr;
          else this.pc += 4;
          break;
        }

        case Op.JL: {
          const addr = this.readU16(this.pc + 2);
          if (this.flags.negative) this.pc = addr;
          else this.pc += 4;
          break;
        }

        case Op.JGE: {
          const addr = this.readU16(this.pc + 2);
          if (!this.flags.negative) this.pc = addr;
          else this.pc += 4;
          break;
        }

        // Stack
        case Op.PUSH: {
          const r = this.bytecode[this.pc + 1];
          this.push(this.readReg(r));
          this.pc += 2;
          break;
        }

        case Op.POP: {
          const r = this.bytecode[this.pc + 1];
          this.writeReg(r, this.pop());
          this.pc += 2;
          break;
        }

        case Op.DUP:
          if (this.stack.length > 0) this.push(this.stack[this.stack.length - 1]);
          this.pc += 2;
          break;

        case Op.SWAP:
          if (this.stack.length >= 2) {
            const a = this.stack.length - 1;
            const b = this.stack.length - 2;
            [this.stack[a], this.stack[b]] = [this.stack[b], this.stack[a]];
          }
          this.pc += 2;
          break;

        // Function
        case Op.RET:
          this.halted = true;
          this.pc++;
          break;

        case Op.CALL:
          this.halted = true;
          this.pc++;
          break;

        // System
        case Op.PRINT: {
          const r = this.bytecode[this.pc + 1];
          this.log(`PRINT R${r} = ${this.readReg(r)}`);
          this.pc += 2;
          break;
        }

        case Op.HALT:
          this.halted = true;
          this.pc++;
          break;

        default:
          this.pc++;
          break;
      }
    }

    if (this.cycles >= this.maxCycles) {
      this.error = "Max cycles exceeded";
    }

    return {
      success: !this.error,
      result: this.regs[0],
      registers: [...this.regs],
      cycles: this.cycles,
      disassembly: disasmStr,
      error: this.error,
      halted: this.halted,
      trace: this.trace,
    };
  }
}

/** Quick execute: assembly string → result */
export function quickExec(assembly: string, trace = false): ExecutionResult {
  const { bytecode } = encodeAssembly(assembly);
  const vm = new FluxVM(bytecode, { trace });
  return vm.execute();
}
