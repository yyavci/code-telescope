import * as vscode from "vscode";
import { PreviewHighlightRange } from "../../shared/extension-webview-protocol";

/** Leading identifier of a symbol name that some servers decorate, e.g. `GetUser(int)` or `List<T>`. */
const SYMBOL_BASE_NAME_PATTERN = /^[^\s(<[:]+/;

/**
 * Locates a symbol name on its line, preferring the occurrence at or after `fromCharacter`.
 * Language servers differ on where a symbol's range starts (the name or the whole declaration)
 * and on whether the name carries a signature, so the bare name is tried as a fallback.
 */
export function findSymbolNameRange(
  lineText: string,
  name: string,
  fromCharacter: number,
): PreviewHighlightRange | undefined {
  const baseName = SYMBOL_BASE_NAME_PATTERN.exec(name)?.[0];
  const candidates = baseName && baseName !== name ? [name, baseName] : [name];

  for (const candidate of candidates.filter(Boolean)) {
    const start =
      findOccurrence(lineText, candidate, fromCharacter, true) ??
      findOccurrence(lineText, candidate, 0, true) ??
      findOccurrence(lineText, candidate, fromCharacter, false) ??
      findOccurrence(lineText, candidate, 0, false);
    if (start !== undefined) return { start, end: start + candidate.length };
  }
  return undefined;
}

const IDENTIFIER_CHAR_PATTERN = /[\p{L}\p{N}_$]/u;

/** First occurrence at or after `from`, optionally only where it is not part of a longer identifier. */
function findOccurrence(lineText: string, name: string, from: number, wholeWord: boolean): number | undefined {
  for (let start = lineText.indexOf(name, from); start !== -1; start = lineText.indexOf(name, start + 1)) {
    if (!wholeWord) return start;
    const charBefore = lineText[start - 1] ?? "";
    const charAfter = lineText[start + name.length] ?? "";
    if (!IDENTIFIER_CHAR_PATTERN.test(charBefore) && !IDENTIFIER_CHAR_PATTERN.test(charAfter)) return start;
  }
  return undefined;
}

/**
 * Returns an icon for the symbol kind
 */
export function getSymbolCodicon(kind: vscode.SymbolKind): string {
  const icons: Record<number, string> = {
    [vscode.SymbolKind.File]: "file",
    [vscode.SymbolKind.Module]: "package",
    [vscode.SymbolKind.Namespace]: "symbol-namespace",
    [vscode.SymbolKind.Package]: "package",
    [vscode.SymbolKind.Class]: "symbol-class",
    [vscode.SymbolKind.Method]: "symbol-method",
    [vscode.SymbolKind.Property]: "symbol-property",
    [vscode.SymbolKind.Field]: "symbol-field",
    [vscode.SymbolKind.Constructor]: "symbol-constructor",
    [vscode.SymbolKind.Enum]: "symbol-enum",
    [vscode.SymbolKind.Interface]: "symbol-interface",
    [vscode.SymbolKind.Function]: "symbol-function",
    [vscode.SymbolKind.Variable]: "symbol-variable",
    [vscode.SymbolKind.Constant]: "symbol-constant",
    [vscode.SymbolKind.String]: "symbol-string",
    [vscode.SymbolKind.Number]: "symbol-number",
    [vscode.SymbolKind.Boolean]: "symbol-boolean",
    [vscode.SymbolKind.Array]: "symbol-array",
    [vscode.SymbolKind.Object]: "symbol-object",
    [vscode.SymbolKind.Key]: "key",
    [vscode.SymbolKind.Null]: "circle-slash",
    [vscode.SymbolKind.EnumMember]: "symbol-enum-member",
    [vscode.SymbolKind.Struct]: "symbol-struct",
    [vscode.SymbolKind.Event]: "symbol-event",
    [vscode.SymbolKind.Operator]: "symbol-operator",
    [vscode.SymbolKind.TypeParameter]: "symbol-type-parameter",
  };

  return icons[kind] ?? "symbol-misc";
}
