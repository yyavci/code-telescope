import type { Range, Uri } from "vscode";

export interface ReferenceInfo {
  index: number;
  uri: Uri;
  range: Range;
  relativePath: string;
  line: number;
  preview: string;
  symbolName: string;
}

export interface ReferenceFinderData {
  references: ReferenceInfo[];
  displayTexts: string[];
  currentSymbol: string | undefined;
  /** Codicon of the finder that produced the locations (references, implementations...) */
  codicon: string;
}
