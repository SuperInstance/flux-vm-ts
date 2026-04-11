/**
 * FLUX Vocabulary System — Pattern → bytecode expansion.
 * Each language defines vocabulary entries mapping natural language
 * patterns to FLUX assembly. Supports regex matching with $var substitution.
 */

export interface VocabEntry {
  pattern: string;
  assembly: string;
  resultReg: number;
  name: string;
  description: string;
  tags: string[];
  level: number; // 0=primitive, 1=composed, etc.
  languageCode: string;
  example?: string;
}

export interface VocabularyMatch {
  entry: VocabEntry;
  captures: Record<string, string>;
  expandedAssembly: string;
}

export function expandAssembly(template: string, captures: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(captures)) {
    result = result.replace(new RegExp(`\\$\\{${key}\\}`, "g"), value);
    result = result.replace(new RegExp(`\\$${key}\\b`, "g"), value);
  }
  return result;
}

export function matchVocabulary(text: string, entries: VocabEntry[]): VocabularyMatch | null {
  for (const entry of entries) {
    // Convert pattern to regex
    const parts = entry.pattern.split(/(\$\w+)/g);
    const regexParts: string[] = [];
    const paramNames: string[] = [];

    for (const part of parts) {
      if (part.startsWith("$")) {
        const name = part.slice(1);
        paramNames.push(name);
        // Match numbers (possibly negative) and words
        regexParts.push(`(?P<${name}>-?\\d+|[\\w.,\\-\\s]+)`);
      } else {
        regexParts.push(part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      }
    }

    const regexStr = `^\\s*${regexParts.join("").trim()}\\s*$`;
    try {
      const regex = new RegExp(regexStr, "i");
      const match = text.match(regex);
      if (match) {
        const captures: Record<string, string> = {};
        for (const name of paramNames) {
          const groups = match as unknown as Record<string, string>;
          if (groups[name]) captures[name] = groups[name].trim();
        }
        const expandedAssembly = expandAssembly(entry.assembly, captures);
        return { entry, captures, expandedAssembly };
      }
    } catch {
      // regex error — skip
    }
  }
  return null;
}

/** Find ALL vocabulary matches in a multi-line text */
export function matchAllVocabulary(text: string, entries: VocabEntry[]): VocabularyMatch[] {
  const lines = text.split("\n");
  const results: VocabularyMatch[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("--") || trimmed.startsWith("//") || trimmed.startsWith("#")) continue;
    const match = matchVocabulary(trimmed, entries);
    if (match) results.push(match);
  }

  return results;
}

export function filterVocabByLanguage(entries: VocabEntry[], code: string): VocabEntry[] {
  return entries.filter((e) => e.languageCode === code);
}

export function getVocabLevels(entries: VocabEntry[]): number[] {
  const levels = new Set(entries.map((e) => e.level));
  return Array.from(levels).sort((a, b) => a - b);
}
