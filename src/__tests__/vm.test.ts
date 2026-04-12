/**
 * flux-vm-ts — Tests
 * VM execution, encoder, decoder, opcodes
 */

import { describe, it, expect } from 'vitest';
import { Op } from '../opcodes';
import { FluxVM, quickExec } from '../vm';
import { encodeAssembly, encodeAssembly as enc } from '../encoder';
import { disassemble, formatAssembly } from '../decoder';

// Helper: assemble and execute
function assembleAndRun(assembly: string, opts?: { maxCycles?: number; trace?: boolean }): { result: ReturnType<FluxVM['execute']>, vm: FluxVM } {
  const { bytecode } = encodeAssembly(assembly);
  const vm = new FluxVM(bytecode, opts);
  const result = vm.execute();
  return { result, vm };
}

// ─── Opcodes ───────────────────────────────────────────────────────────────

describe('Opcodes', () => {
  it('should have NOP = 0x00', () => { expect(Op.NOP).toBe(0x00); });
  it('should have HALT = 0xFF', () => { expect(Op.HALT).toBe(0xFF); });
  it('should have IADD = 0x08', () => { expect(Op.IADD).toBe(0x08); });
  it('should have PUSH = 0x20', () => { expect(Op.PUSH).toBe(0x20); });
  it('should have JMP = 0x04', () => { expect(Op.JMP).toBe(0x04); });
});

// ─── Encoder ───────────────────────────────────────────────────────────────

describe('Encoder', () => {
  it('should encode NOP', () => {
    const { bytecode } = encodeAssembly('NOP\nHALT');
    expect(bytecode[0]).toBe(Op.NOP);
    expect(bytecode[1]).toBe(Op.HALT);
  });

  it('should encode MOV R0, R1', () => {
    const { bytecode } = encodeAssembly('MOV R0, R1\nHALT');
    expect(bytecode[0]).toBe(Op.MOV);
  });

  it('should encode arithmetic', () => {
    const { bytecode } = encodeAssembly('IADD R0, R1, R2\nHALT');
    expect(bytecode[0]).toBe(Op.IADD);
  });

  it('should encode PUSH with register', () => {
    const { bytecode } = encodeAssembly('PUSH R0\nHALT');
    expect(bytecode[0]).toBe(Op.PUSH);
  });

  it('should encode labels and JMP', () => {
    const { bytecode, labels } = encodeAssembly('start:\nJMP start\nHALT');
    expect(bytecode[0]).toBe(Op.JMP);
    expect(labels.has('start')).toBe(true);
  });

  it('should resolve label to byte offset, not instruction index', () => {
    // MOVI is 4 bytes, JZ is 4 bytes, MOVI is 4 bytes, HALT is 1 byte
    // label 'end' should point to byte offset 12 (the HALT), not index 3
    const { labels } = encodeAssembly('MOVI R0, 0\nJZ R0, end\nMOVI R2, 99\nend:\nHALT');
    expect(labels.get('end')).toBe(12);
  });

  it('should encode MOVI with correct 4-byte format', () => {
    const { bytecode, instructions } = encodeAssembly('MOVI R1, 42\nHALT');
    // MOVI = opcode(1) + reg(1) + imm16(2) = 4 bytes
    expect(instructions[0].size).toBe(4);
    expect(instructions[0].opcode).toBe(Op.MOVI);
    expect(bytecode[1]).toBe(1); // R1
  });

  it('should handle forward label references', () => {
    const { labels, bytecode } = encodeAssembly('JMP done\nNOP\ndone:\nHALT');
    expect(labels.get('done')).toBeGreaterThan(0);
    // JMP is at byte 0, 3 bytes long; NOP is at byte 3, 1 byte; HALT at byte 4
    expect(labels.get('done')).toBe(4);
  });
});

// ─── Decoder ───────────────────────────────────────────────────────────────

describe('Decoder', () => {
  it('should disassemble bytecode', () => {
    const { bytecode } = encodeAssembly('NOP\nIADD R0, R1, R2\nHALT');
    const instructions = disassemble(bytecode);
    expect(instructions.length).toBeGreaterThanOrEqual(3);
    expect(instructions[0].mnemonic).toBe('NOP');
  });

  it('should format assembly', () => {
    const { bytecode } = encodeAssembly('NOP\nHALT');
    const instructions = disassemble(bytecode);
    const formatted = formatAssembly(instructions);
    expect(formatted).toContain('NOP');
  });
});

// ─── FluxVM basics ─────────────────────────────────────────────────────────

describe('FluxVM basics', () => {
  it('should execute NOP', () => {
    const { result } = assembleAndRun('NOP\nHALT');
    expect(result.success).toBe(true);
    expect(result.halted).toBe(true);
  });

  it('should execute MOV', () => {
    const { result, vm } = assembleAndRun('MOV R0, R1\nHALT');
    expect(result.success).toBe(true);
    const state = vm.getState();
    expect(state.registers[0]).toBe(0);
  });

  it('should execute IADD', () => {
    const asm = `
MOVI R1, 5
MOVI R2, 3
IADD R0, R1, R2
HALT`;
    const { result, vm } = assembleAndRun(asm);
    expect(result.success).toBe(true);
    expect(vm.getState().registers[0]).toBe(8);
  });

  it('should halt on HALT', () => {
    const { result } = assembleAndRun('HALT');
    expect(result.halted).toBe(true);
    expect(result.cycles).toBe(1);
  });

  it('should track cycles', () => {
    const { result } = assembleAndRun('NOP\nNOP\nNOP\nHALT');
    expect(result.cycles).toBe(4);
  });

  it('should respect max cycles', () => {
    const { bytecode } = encodeAssembly('NOP\nJMP 0');
    const vm = new FluxVM(bytecode, { maxCycles: 10 });
    const result = vm.execute();
    expect(result.cycles).toBeLessThanOrEqual(10);
  });

  it('should execute PUSH and POP', () => {
    const asm = 'MOVI R0, 42\nPUSH R0\nPOP R1\nHALT';
    const { result } = assembleAndRun(asm);
    expect(result.success).toBe(true);
  });

  it('should handle flags after comparison', () => {
    const asm = `
MOVI R0, 5
MOVI R1, 5
ICMP R0, R1
HALT`;
    const { result } = assembleAndRun(asm);
    expect(result.success).toBe(true);
  });

  it('should return disassembly', () => {
    const { result } = assembleAndRun('NOP\nHALT');
    expect(result.disassembly).toContain('NOP');
  });

  it('should return state snapshot', () => {
    const { bytecode } = encodeAssembly('HALT');
    const vm = new FluxVM(bytecode);
    const state = vm.getState();
    expect(state.registers.length).toBe(64);
    expect(state.pc).toBe(0);
    expect(state.halted).toBe(false);
  });

  it('should handle ISUB', () => {
    const asm = `
MOVI R1, 10
MOVI R2, 3
ISUB R0, R1, R2
HALT`;
    const { vm } = assembleAndRun(asm);
    expect(vm.getState().registers[0]).toBe(7);
  });

  it('should handle IMUL', () => {
    const asm = `
MOVI R1, 7
MOVI R2, 6
IMUL R0, R1, R2
HALT`;
    const { vm } = assembleAndRun(asm);
    expect(vm.getState().registers[0]).toBe(42);
  });

  it('should handle IAND', () => {
    const asm = `
MOVI R1, 15
MOVI R2, 6
IAND R0, R1, R2
HALT`;
    const { result } = assembleAndRun(asm);
    expect(result.success).toBe(true);
    expect(result.registers[0]).toBe(6);
  });

  it('should handle DUP and SWAP', () => {
    const asm = `
MOVI R0, 1
PUSH R0
MOVI R0, 2
PUSH R0
SWAP
POP R1
POP R2
HALT`;
    const { result } = assembleAndRun(asm);
    expect(result.success).toBe(true);
    expect(result.registers[1]).toBe(1);
    expect(result.registers[2]).toBe(2);
  });
});

// ─── Arithmetic ────────────────────────────────────────────────────────────

describe('Arithmetic operations', () => {
  it('IADD: positive numbers', () => {
    const { vm } = assembleAndRun('MOVI R1, 10\nMOVI R2, 25\nIADD R0, R1, R2\nHALT');
    expect(vm.getState().registers[0]).toBe(35);
  });

  it('IADD: negative result', () => {
    const { vm } = assembleAndRun('MOVI R1, 5\nMOVI R2, 10\nISUB R0, R1, R2\nHALT');
    expect(vm.getState().registers[0]).toBe(-5);
  });

  it('ISUB: positive numbers', () => {
    const { vm } = assembleAndRun('MOVI R1, 100\nMOVI R2, 37\nISUB R0, R1, R2\nHALT');
    expect(vm.getState().registers[0]).toBe(63);
  });

  it('IMUL: positive numbers', () => {
    const { vm } = assembleAndRun('MOVI R1, 12\nMOVI R2, 8\nIMUL R0, R1, R2\nHALT');
    expect(vm.getState().registers[0]).toBe(96);
  });

  it('IMUL: negative × positive', () => {
    // Load -7 into R1 via MOVI (signed 16-bit: 65529)
    const { vm } = assembleAndRun('MOVI R1, 65529\nMOVI R2, 6\nIMUL R0, R1, R2\nHALT');
    expect(vm.getState().registers[0]).toBe(-42);
  });

  it('IDIV: exact division', () => {
    const { vm } = assembleAndRun('MOVI R1, 20\nMOVI R2, 4\nIDIV R0, R1, R2\nHALT');
    expect(vm.getState().registers[0]).toBe(5);
  });

  it('IDIV: truncates toward zero', () => {
    const { vm } = assembleAndRun('MOVI R1, 7\nMOVI R2, 3\nIDIV R0, R1, R2\nHALT');
    expect(vm.getState().registers[0]).toBe(2);
  });

  it('IDIV: negative division truncates toward zero', () => {
    const { vm } = assembleAndRun('MOVI R1, 65529\nMOVI R2, 3\nIDIV R0, R1, R2\nHALT');
    expect(vm.getState().registers[0]).toBe(-2);
  });

  it('IMOD: positive remainder', () => {
    const { vm } = assembleAndRun('MOVI R1, 17\nMOVI R2, 5\nIMOD R0, R1, R2\nHALT');
    expect(vm.getState().registers[0]).toBe(2);
  });

  it('IMOD: zero remainder', () => {
    const { vm } = assembleAndRun('MOVI R1, 10\nMOVI R2, 5\nIMOD R0, R1, R2\nHALT');
    expect(vm.getState().registers[0]).toBe(0);
  });

  it('INEG: negate positive', () => {
    const { vm } = assembleAndRun('MOVI R1, 42\nINEG R1\nHALT');
    expect(vm.getState().registers[1]).toBe(-42);
  });

  it('INEG: negate negative', () => {
    const { vm } = assembleAndRun('MOVI R1, 65529\nINEG R1\nHALT');
    expect(vm.getState().registers[1]).toBe(7);
  });

  it('INC: increment register', () => {
    const { vm } = assembleAndRun('MOVI R1, 9\nINC R1\nHALT');
    expect(vm.getState().registers[1]).toBe(10);
  });

  it('DEC: decrement register', () => {
    const { vm } = assembleAndRun('MOVI R1, 5\nDEC R1\nHALT');
    expect(vm.getState().registers[1]).toBe(4);
  });
});

// ─── Division by zero ─────────────────────────────────────────────────────

describe('Division by zero', () => {
  it('IDIV by zero sets error and halts', () => {
    const { result } = assembleAndRun('MOVI R1, 10\nMOVI R2, 0\nIDIV R0, R1, R2\nHALT');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Division by zero');
    expect(result.halted).toBe(true);
  });

  it('IMOD by zero sets error and halts', () => {
    const { result } = assembleAndRun('MOVI R1, 10\nMOVI R2, 0\nIMOD R0, R1, R2\nHALT');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Modulo by zero');
    expect(result.halted).toBe(true);
  });
});

// ─── Bitwise operations ───────────────────────────────────────────────────

describe('Bitwise operations', () => {
  it('IAND: basic AND', () => {
    const { vm } = assembleAndRun('MOVI R1, 15\nMOVI R2, 6\nIAND R0, R1, R2\nHALT');
    expect(vm.getState().registers[0]).toBe(6);
  });

  it('IOR: basic OR', () => {
    const { vm } = assembleAndRun('MOVI R1, 12\nMOVI R2, 5\nIOR R0, R1, R2\nHALT');
    expect(vm.getState().registers[0]).toBe(13);
  });

  it('IXOR: basic XOR', () => {
    const { vm } = assembleAndRun('MOVI R1, 12\nMOVI R2, 10\nIXOR R0, R1, R2\nHALT');
    expect(vm.getState().registers[0]).toBe(6);
  });

  it('INOT: bitwise NOT', () => {
    const { vm } = assembleAndRun('MOVI R1, 0\nINOT R1\nHALT');
    expect(vm.getState().registers[1]).toBe(-1); // ~0 = -1 in 32-bit signed
  });

  it('ISHL: shift left', () => {
    const { vm } = assembleAndRun('MOVI R1, 1\nMOVI R2, 4\nISHL R0, R1, R2\nHALT');
    expect(vm.getState().registers[0]).toBe(16);
  });

  it('ISHR: shift right', () => {
    const { vm } = assembleAndRun('MOVI R1, 16\nMOVI R2, 2\nISHR R0, R1, R2\nHALT');
    expect(vm.getState().registers[0]).toBe(4);
  });
});

// ─── Comparison / Flags ───────────────────────────────────────────────────

describe('Comparison and flags', () => {
  it('CMP: equal values set zero flag', () => {
    const { vm } = assembleAndRun('MOVI R1, 7\nMOVI R2, 7\nCMP R1, R2\nHALT');
    expect(vm.getState().flags.zero).toBe(true);
    expect(vm.getState().flags.negative).toBe(false);
  });

  it('CMP: greater sets negative=false', () => {
    const { vm } = assembleAndRun('MOVI R1, 10\nMOVI R2, 5\nCMP R1, R2\nHALT');
    expect(vm.getState().flags.zero).toBe(false);
    expect(vm.getState().flags.negative).toBe(false);
  });

  it('CMP: less sets negative flag', () => {
    const { vm } = assembleAndRun('MOVI R1, 3\nMOVI R2, 8\nCMP R1, R2\nHALT');
    expect(vm.getState().flags.zero).toBe(false);
    expect(vm.getState().flags.negative).toBe(true);
  });

  it('ICMP: equal values set zero flag', () => {
    const { vm } = assembleAndRun('MOVI R1, 42\nMOVI R2, 42\nICMP R1, R2\nHALT');
    expect(vm.getState().flags.zero).toBe(true);
    expect(vm.getState().flags.negative).toBe(false);
  });

  it('ICMP: less sets negative flag', () => {
    const { vm } = assembleAndRun('MOVI R1, 1\nMOVI R2, 10\nICMP R1, R2\nHALT');
    expect(vm.getState().flags.zero).toBe(false);
    expect(vm.getState().flags.negative).toBe(true);
  });

  it('ICMP: greater sets zero=false, negative=false', () => {
    const { vm } = assembleAndRun('MOVI R1, 20\nMOVI R2, 5\nICMP R1, R2\nHALT');
    expect(vm.getState().flags.zero).toBe(false);
    expect(vm.getState().flags.negative).toBe(false);
  });
});

// ─── Conditional jumps ────────────────────────────────────────────────────

describe('Conditional jumps', () => {
  it('JZ taken: register is zero', () => {
    const asm = `
MOVI R0, 0
JZ R0, end
MOVI R1, 999
end:
HALT`;
    const { vm } = assembleAndRun(asm);
    expect(vm.getState().registers[1]).toBe(0); // MOVI R1, 99 should be skipped
  });

  it('JZ not taken: register is non-zero', () => {
    const asm = `
MOVI R0, 1
JZ R0, end
MOVI R1, 42
end:
HALT`;
    const { vm } = assembleAndRun(asm);
    expect(vm.getState().registers[1]).toBe(42); // MOVI R1, 42 should execute
  });

  it('JNZ taken: register is non-zero', () => {
    const asm = `
MOVI R0, 5
JNZ R0, end
MOVI R1, 999
end:
HALT`;
    const { vm } = assembleAndRun(asm);
    expect(vm.getState().registers[1]).toBe(0); // skipped
  });

  it('JNZ not taken: register is zero', () => {
    const asm = `
MOVI R0, 0
JNZ R0, end
MOVI R1, 77
end:
HALT`;
    const { vm } = assembleAndRun(asm);
    expect(vm.getState().registers[1]).toBe(77); // executed
  });

  it('JE taken: after CMP with equal values', () => {
    const asm = `
MOVI R1, 10
MOVI R2, 10
CMP R1, R2
JE end
MOVI R3, 999
end:
HALT`;
    const { vm } = assembleAndRun(asm);
    expect(vm.getState().registers[3]).toBe(0); // skipped
  });

  it('JE not taken: after CMP with different values', () => {
    const asm = `
MOVI R1, 3
MOVI R2, 7
CMP R1, R2
JE end
MOVI R3, 55
end:
HALT`;
    const { vm } = assembleAndRun(asm);
    expect(vm.getState().registers[3]).toBe(55); // executed
  });

  it('JNE taken: after CMP with different values', () => {
    const asm = `
MOVI R1, 3
MOVI R2, 7
CMP R1, R2
JNE end
MOVI R3, 999
end:
HALT`;
    const { vm } = assembleAndRun(asm);
    expect(vm.getState().registers[3]).toBe(0); // skipped
  });

  it('JNE not taken: after CMP with equal values', () => {
    const asm = `
MOVI R1, 5
MOVI R2, 5
CMP R1, R2
JNE end
MOVI R3, 88
end:
HALT`;
    const { vm } = assembleAndRun(asm);
    expect(vm.getState().registers[3]).toBe(88); // executed
  });

  it('JL taken: after CMP where R1 < R2', () => {
    const asm = `
MOVI R1, 2
MOVI R2, 8
CMP R1, R2
JL end
MOVI R3, 999
end:
HALT`;
    const { vm } = assembleAndRun(asm);
    expect(vm.getState().registers[3]).toBe(0); // skipped
  });

  it('JL not taken: after CMP where R1 > R2', () => {
    const asm = `
MOVI R1, 10
MOVI R2, 3
CMP R1, R2
JL end
MOVI R3, 44
end:
HALT`;
    const { vm } = assembleAndRun(asm);
    expect(vm.getState().registers[3]).toBe(44); // executed
  });

  it('JGE taken: after CMP where R1 >= R2', () => {
    const asm = `
MOVI R1, 10
MOVI R2, 3
CMP R1, R2
JGE end
MOVI R3, 999
end:
HALT`;
    const { vm } = assembleAndRun(asm);
    expect(vm.getState().registers[3]).toBe(0); // skipped
  });

  it('JGE not taken: after CMP where R1 < R2', () => {
    const asm = `
MOVI R1, 1
MOVI R2, 5
CMP R1, R2
JGE end
MOVI R3, 33
end:
HALT`;
    const { vm } = assembleAndRun(asm);
    expect(vm.getState().registers[3]).toBe(33); // executed
  });
});

// ─── Unconditional jumps ──────────────────────────────────────────────────

describe('Unconditional jumps', () => {
  it('JMP forward', () => {
    const asm = `
JMP end
MOVI R1, 999
end:
MOVI R0, 42
HALT`;
    const { vm } = assembleAndRun(asm);
    expect(vm.getState().registers[0]).toBe(42);
    expect(vm.getState().registers[1]).toBe(0); // skipped
  });

  it('JMP backward creates loop bounded by maxCycles', () => {
    const asm = `
MOVI R1, 0
loop:
INC R1
JMP loop`;
    // Cycle 1: MOVI; cycles 2-5: INC+JMP pairs (2 per iter)
    // After cycles 2,3: R1=1; after 4,5: R1=2; then maxCycles hit
    const { result, vm } = assembleAndRun(asm, { maxCycles: 5 });
    expect(result.error).toBe('Max cycles exceeded');
    expect(vm.getState().registers[1]).toBe(2);
  });
});

// ─── Stack operations ─────────────────────────────────────────────────────

describe('Stack operations', () => {
  it('PUSH then POP preserves value', () => {
    const { vm } = assembleAndRun('MOVI R0, 123\nPUSH R0\nPOP R1\nHALT');
    expect(vm.getState().registers[1]).toBe(123);
  });

  it('DUP duplicates top of stack', () => {
    const asm = `
MOVI R0, 7
PUSH R0
DUP
POP R1
POP R2
HALT`;
    const { vm } = assembleAndRun(asm);
    expect(vm.getState().registers[1]).toBe(7);
    expect(vm.getState().registers[2]).toBe(7);
  });

  it('SWAP exchanges top two stack entries', () => {
    const asm = `
MOVI R0, 10
MOVI R1, 20
PUSH R0
PUSH R1
SWAP
POP R2
POP R3
HALT`;
    const { vm } = assembleAndRun(asm);
    expect(vm.getState().registers[2]).toBe(10); // was below
    expect(vm.getState().registers[3]).toBe(20); // was on top
  });

  it('stack state after multiple push/pop', () => {
    const asm = `
MOVI R0, 1
MOVI R1, 2
MOVI R2, 3
PUSH R0
PUSH R1
PUSH R2
POP R3
POP R4
POP R5
HALT`;
    const { vm } = assembleAndRun(asm);
    expect(vm.getState().registers[3]).toBe(3);
    expect(vm.getState().registers[4]).toBe(2);
    expect(vm.getState().registers[5]).toBe(1);
  });
});

// ─── MOVI negative values ─────────────────────────────────────────────────

describe('MOVI with negative values', () => {
  it('MOVI with negative 16-bit value', () => {
    // -1 in signed 16-bit = 65535
    const { vm } = assembleAndRun('MOVI R0, 65535\nHALT');
    expect(vm.getState().registers[0]).toBe(-1);
  });

  it('MOVI with -128 (0xFF80)', () => {
    // -128 in unsigned 16-bit = 65408
    const { vm } = assembleAndRun('MOVI R0, 65408\nHALT');
    expect(vm.getState().registers[0]).toBe(-128);
  });

  it('MOVI with max positive 16-bit value 32767', () => {
    const { vm } = assembleAndRun('MOVI R0, 32767\nHALT');
    expect(vm.getState().registers[0]).toBe(32767);
  });

  it('MOVI with -32768 (0x8000)', () => {
    const { vm } = assembleAndRun('MOVI R0, 32768\nHALT');
    expect(vm.getState().registers[0]).toBe(-32768);
  });
});

// ─── MOV register to register ─────────────────────────────────────────────

describe('MOV register to register', () => {
  it('MOV copies value from source to destination', () => {
    const { vm } = assembleAndRun('MOVI R1, 100\nMOV R0, R1\nHALT');
    expect(vm.getState().registers[0]).toBe(100);
    expect(vm.getState().registers[1]).toBe(100);
  });

  it('MOV from zero register', () => {
    const { vm } = assembleAndRun('MOV R5, R0\nHALT');
    expect(vm.getState().registers[5]).toBe(0);
  });
});

// ─── Trace output ─────────────────────────────────────────────────────────

describe('Trace output', () => {
  it('trace is empty when not enabled', () => {
    const { result } = assembleAndRun('MOVI R0, 5\nPRINT R0\nHALT');
    expect(result.trace).toEqual([]);
  });

  it('trace captures PRINT output when enabled', () => {
    const { result } = assembleAndRun('MOVI R0, 42\nPRINT R0\nHALT', { trace: true });
    expect(result.trace.length).toBeGreaterThan(0);
    expect(result.trace[0]).toContain('42');
  });
});

// ─── Max cycles exceeded ──────────────────────────────────────────────────

describe('Max cycles exceeded', () => {
  it('infinite loop hits max cycles', () => {
    const asm = 'loop:\nNOP\nJMP loop';
    const { result } = assembleAndRun(asm, { maxCycles: 100 });
    expect(result.error).toBe('Max cycles exceeded');
    expect(result.cycles).toBe(100);
  });

  it('tight NOP loop exceeds maxCycles', () => {
    const { bytecode } = encodeAssembly('NOP\nJMP 0');
    const vm = new FluxVM(bytecode, { maxCycles: 20 });
    const result = vm.execute();
    expect(result.error).toBe('Max cycles exceeded');
  });
});

// ─── Error state on division by zero ──────────────────────────────────────

describe('Error state on division by zero', () => {
  it('IDIV by zero: VM enters error state', () => {
    const { vm } = assembleAndRun('MOVI R1, 10\nMOVI R2, 0\nIDIV R0, R1, R2\nHALT');
    const state = vm.getState();
    expect(state.error).toBe('Division by zero');
    expect(state.halted).toBe(true);
  });

  it('IMOD by zero: VM enters error state', () => {
    const { vm } = assembleAndRun('MOVI R1, 10\nMOVI R2, 0\nIMOD R0, R1, R2\nHALT');
    const state = vm.getState();
    expect(state.error).toBe('Modulo by zero');
    expect(state.halted).toBe(true);
  });
});

// ─── VM state snapshot ────────────────────────────────────────────────────

describe('VM state snapshot', () => {
  it('initial state has all registers zero', () => {
    const { bytecode } = encodeAssembly('HALT');
    const vm = new FluxVM(bytecode);
    const state = vm.getState();
    expect(state.registers.every(r => r === 0)).toBe(true);
  });

  it('state after arithmetic shows correct register values', () => {
    const { vm } = assembleAndRun('MOVI R1, 10\nMOVI R2, 20\nIADD R3, R1, R2\nHALT');
    const state = vm.getState();
    expect(state.registers[1]).toBe(10);
    expect(state.registers[2]).toBe(20);
    expect(state.registers[3]).toBe(30);
  });

  it('state shows correct PC after halt', () => {
    const { vm } = assembleAndRun('NOP\nHALT');
    const state = vm.getState();
    expect(state.pc).toBe(2); // NOP(1) + HALT(1) = pc after HALT = 2
    expect(state.halted).toBe(true);
  });

  it('state shows correct stack after push', () => {
    const { vm } = assembleAndRun('MOVI R0, 99\nPUSH R0\nHALT');
    const state = vm.getState();
    expect(state.stack).toEqual([99]);
  });
});

// ─── quickExec helper ─────────────────────────────────────────────────────

describe('quickExec helper', () => {
  it('returns execution result for simple program', () => {
    const result = quickExec('MOVI R0, 42\nHALT');
    expect(result.success).toBe(true);
    expect(result.result).toBe(42);
  });

  it('returns error for division by zero', () => {
    const result = quickExec('MOVI R1, 10\nMOVI R2, 0\nIDIV R0, R1, R2\nHALT');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Division by zero');
  });

  it('supports trace mode', () => {
    const result = quickExec('MOVI R0, 1\nPRINT R0\nHALT', true);
    expect(result.trace.length).toBeGreaterThan(0);
  });
});

// ─── Multi-register programs ──────────────────────────────────────────────

describe('Multi-register programs', () => {
  it('uses R0 through R7', () => {
    const asm = `
MOVI R0, 1
MOVI R1, 2
MOVI R2, 3
MOVI R3, 4
MOVI R4, 5
MOVI R5, 6
MOVI R6, 7
MOVI R7, 8
HALT`;
    const { vm } = assembleAndRun(asm);
    for (let i = 0; i < 8; i++) {
      expect(vm.getState().registers[i]).toBe(i + 1);
    }
  });

  it('chain additions across registers', () => {
    const asm = `
MOVI R0, 1
MOVI R1, 2
MOVI R2, 3
IADD R3, R0, R1
IADD R4, R3, R2
HALT`;
    const { vm } = assembleAndRun(asm);
    expect(vm.getState().registers[3]).toBe(3);
    expect(vm.getState().registers[4]).toBe(6);
  });
});

// ─── Register bounds ──────────────────────────────────────────────────────

describe('Register bounds', () => {
  it('R63 is valid (max register)', () => {
    const { vm } = assembleAndRun('MOVI R63, 100\nHALT');
    expect(vm.getState().registers[63]).toBe(100);
  });

  it('R64 is out of bounds, write is silently ignored', () => {
    const { vm } = assembleAndRun('MOVI R0, 50\nMOV R64, R0\nHALT');
    // R64 is out of the 64-register array (0-63), write is ignored
    expect(vm.getState().registers[0]).toBe(50);
  });
});

// ─── RET and CALL ─────────────────────────────────────────────────────────

describe('RET and CALL', () => {
  it('RET halts execution', () => {
    const { result } = assembleAndRun('MOVI R0, 42\nRET');
    expect(result.halted).toBe(true);
    expect(result.result).toBe(42);
  });

  it('CALL halts execution (stub)', () => {
    const { result } = assembleAndRun('MOVI R0, 99\nCALL');
    expect(result.halted).toBe(true);
    expect(result.result).toBe(99);
  });
});

// ─── Complex programs ─────────────────────────────────────────────────────

describe('Complex programs', () => {
  it('counter loop: count to 5', () => {
    // R0 = counter (0→5), R1 = limit (5)
    // When R0=5, CMP(5,5)→zero=true,negative=false, JL not taken
    const asm = `
MOVI R0, 0
MOVI R1, 5
loop:
INC R0
CMP R0, R1
JL loop
HALT`;
    const { vm } = assembleAndRun(asm);
    expect(vm.getState().registers[0]).toBe(5);
  });

  it('accumulate sum 1..10', () => {
    // R0 = sum, R1 = counter, R2 = limit
    // JL stops when R1 >= R2 (R1=10, CMP(10,10)→not less)
    // Sum = 1+2+...+9 = 45
    const asm = `
MOVI R0, 0
MOVI R1, 1
MOVI R2, 10
loop:
IADD R0, R0, R1
INC R1
CMP R1, R2
JL loop
HALT`;
    const { vm } = assembleAndRun(asm);
    expect(vm.getState().registers[0]).toBe(45);
  });

  it('conditional swap: skip swap if R1 >= R2', () => {
    // R1=10, R2=3 → R1 >= R2, so JGE jumps past swap
    const asm = `
MOVI R1, 10
MOVI R2, 3
CMP R1, R2
JGE end
PUSH R1
MOV R1, R2
POP R2
end:
HALT`;
    const { vm } = assembleAndRun(asm);
    // R1=10 >= R2=3, CMP sets negative=false, JGE taken, swap skipped
    expect(vm.getState().registers[1]).toBe(10);
    expect(vm.getState().registers[2]).toBe(3);
  });

  it('conditional swap when R1 < R2', () => {
    const asm = `
MOVI R1, 3
MOVI R2, 10
CMP R1, R2
JGE skip
PUSH R1
MOV R1, R2
POP R2
skip:
HALT`;
    const { vm } = assembleAndRun(asm);
    // R1=3 < R2=10, CMP sets negative=true, JGE not taken, swap happens
    expect(vm.getState().registers[1]).toBe(10);
    expect(vm.getState().registers[2]).toBe(3);
  });

  it('multiply via repeated addition: 3 × 7 = 21', () => {
    // R0 = result, R1 = multiplier counter, R2 = multiplicand, R3 = limit
    const asm = `
MOVI R0, 0
MOVI R1, 0
MOVI R2, 7
MOVI R3, 3
loop:
IADD R0, R0, R2
INC R1
CMP R1, R3
JL loop
HALT`;
    const { vm } = assembleAndRun(asm);
    expect(vm.getState().registers[0]).toBe(21);
  });

  it('fibonacci: compute fib(10) iteratively', () => {
    // R0 = a (starts 0), R1 = b (starts 1), R2 = counter, R3 = temp, R4 = limit
    // After 10 iterations (counter 0..9): a=34, b=55
    const asm = `
MOVI R0, 0
MOVI R1, 1
MOVI R2, 0
MOVI R4, 9
loop:
MOV R3, R1
IADD R1, R0, R1
MOV R0, R3
INC R2
CMP R2, R4
JL loop
HALT`;
    const { vm } = assembleAndRun(asm);
    // After 9 iterations: a=21, b=34 ... wait let me recalculate
    // fib(0)=0, fib(1)=1, fib(2)=1, ..., fib(10)=55
    // iter0: a=1,b=1; iter1: a=1,b=2; iter2: a=2,b=3; iter3: a=3,b=5
    // iter4: a=5,b=8; iter5: a=8,b=13; iter6: a=13,b=21; iter7: a=21,b=34
    // iter8: a=34,b=55; counter=9, CMP(9,9)→not less→stop
    expect(vm.getState().registers[1]).toBe(55);
  });

  it('max cycles exceeded on unterminated loop', () => {
    const asm = `
MOVI R0, 0
loop:
INC R0
JMP loop`;
    // Cycle 1: MOVI; cycles 2-50: INC+JMP pairs (2 cycles each)
    // 49 remaining / 2 = 24 full loops (R0=24), + 1 cycle for INC (R0=25)
    const { result } = assembleAndRun(asm, { maxCycles: 50 });
    expect(result.error).toBe('Max cycles exceeded');
    expect(result.registers[0]).toBe(25);
  });
});

// ─── JZ encoder bug regression ────────────────────────────────────────────

describe('JZ encoder bug (regression)', () => {
  it('should handle JZ execution — encoder label offset bug FIX', () => {
    // R0=0, JZ checks reg value===0, jumps to end
    const asm = 'MOVI R0, 0\nJZ R0, end\nMOVI R2, 99\nend:\nHALT';
    const { result } = assembleAndRun(asm);
    expect(result.success).toBe(true);
    expect(result.registers[2]).toBe(0); // MOVI R2, 99 was skipped
  });
});
