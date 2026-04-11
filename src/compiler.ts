/**
 * FLUX Compiler Pipeline — Natural language text → bytecode → execution.
 * Takes NL text in any language, matches vocabulary patterns,
 * assembles bytecode, executes on the VM.
 */

import { VocabEntry, matchAllVocabulary, expandAssembly } from "./vocabulary";
import { encodeAssembly } from "./encoder";
import { bytecodeToHex, formatAssembly, disassemble } from "./decoder";
import { FluxVM, ExecutionResult } from "./vm";

export interface CompilationStep {
  type: "source" | "vocab-match" | "assembly" | "bytecode" | "execution";
  content: string;
  detail?: string;
}

export interface CompilationResult {
  success: boolean;
  steps: CompilationStep[];
  bytecode: Uint8Array | null;
  execution: ExecutionResult | null;
  error: string | null;
  matchesCount: number;
  hexDump: string;
  disassembly: string;
}

export class FluxCompiler {
  private vocabularies: VocabEntry[];

  constructor(vocabularies: VocabEntry[]) {
    this.vocabularies = vocabularies;
  }

  compile(naturalLanguage: string, languageCode: string): CompilationResult {
    const steps: CompilationStep[] = [];

    // Step 1: Record source
    steps.push({ type: "source", content: naturalLanguage });

    // Step 2: Filter vocabulary by language
    const langVocab = this.vocabularies.filter(
      (v) => v.languageCode === languageCode || v.languageCode === "universal"
    );

    // Step 3: Match vocabulary patterns
    const matches = matchAllVocabulary(naturalLanguage, langVocab);

    if (matches.length === 0) {
      return {
        success: false,
        steps,
        bytecode: null,
        execution: null,
        error: "No vocabulary pattern matched. Try a different phrase or check the vocabulary for this language.",
        matchesCount: 0,
        hexDump: "",
        disassembly: "",
      };
    }

    for (const match of matches) {
      steps.push({
        type: "vocab-match",
        content: match.entry.pattern,
        detail: `"${match.entry.name}" → ${match.expandedAssembly}`,
      });
    }

    // Step 4: Combine assembly from all matches
    const fullAssembly = matches.map((m) => m.expandedAssembly).join("\n") + "\nHALT";
    steps.push({ type: "assembly", content: fullAssembly });

    // Step 5: Encode to bytecode
    let encoded;
    try {
      encoded = encodeAssembly(fullAssembly);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : "Assembly encoding failed";
      return {
        success: false,
        steps,
        bytecode: null,
        execution: null,
        error: errMsg,
        matchesCount: matches.length,
        hexDump: "",
        disassembly: "",
      };
    }

    steps.push({ type: "bytecode", content: bytecodeToHex(encoded.bytecode) });

    // Step 6: Execute
    const vm = new FluxVM(encoded.bytecode, { maxCycles: 100_000 });
    const execution = vm.execute();

    steps.push({
      type: "execution",
      content: `R0 = ${execution.result}`,
      detail: `${execution.cycles} cycles${execution.error ? ` | Error: ${execution.error}` : ""}`,
    });

    return {
      success: execution.success,
      steps,
      bytecode: encoded.bytecode,
      execution,
      error: execution.error,
      matchesCount: matches.length,
      hexDump: bytecodeToHex(encoded.bytecode),
      disassembly: formatAssembly(disassemble(encoded.bytecode)),
    };
  }
}
