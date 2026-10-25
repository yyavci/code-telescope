import * as vscode from "vscode";
import { ReferenceFinderData, ReferenceInfo } from "../../../shared/exchange/lsp-refs";
import { TextPreviewData } from "../../../shared/extension-webview-protocol";
import { ChunkableProvider } from "../abstractions/chunkable-provider";
import { FileReader } from "../common/file-reader";
import { PreContextManager } from "../common/pre-context";
import { FuzzyFinderAdapter, FuzzyFinderProvider } from "../decorators/fuzzy-finder-provider.decorator";

@FuzzyFinderAdapter({
  fuzzy: "workspace.references",
  previewRenderer: "preview.buffer",
  dataAdapter: "workspaceReferencesAdapter",
  name: "References",
  description: "Find all references to the symbol at cursor",
})
export class ReferencesFinder implements FuzzyFinderProvider, ChunkableProvider<ReferenceFinderData> {
  private cachedRefs: ReferenceInfo[] | null = null;
  chunkSize = 2500;

  async onPanelClose(): Promise<void> {
    this.cachedRefs = null;
  }

  async querySelectableOptions(): Promise<ReferenceInfo[]> {
    this.cachedRefs = await this.getReferences();

    if (this.cachedRefs.length === 0) {
      return [];
    }

    return this.cachedRefs;
  }

  mapChunk(items: ReferenceInfo[]): ReferenceFinderData {
    const displayTexts = items.map((ref) => {
      const location = `${ref.relativePath}:${ref.line}`.padEnd(55);
      return `${location} ${ref.preview.trim()}`;
    });
    return {
      references: items,
      displayTexts,
      currentSymbol: items[0]?.symbolName,
    };
  }

  async onSelect(identifier: string): Promise<void> {
    const index = parseInt(identifier, 10);
    const selected = this.cachedRefs?.[index];
    if (!selected) return;

    const document = await vscode.workspace.openTextDocument(selected.uri);
    const editor = await vscode.window.showTextDocument(document);
    const position = selected.range.start;
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(selected.range, vscode.TextEditorRevealType.InCenter);
  }

  async getPreviewData(identifier: string): Promise<TextPreviewData> {
    const index = parseInt(identifier, 10);
    const selected = this.cachedRefs?.[index];

    if (!selected) {
      return { content: "No reference selected", kind: "text" };
    }

    const content = await FileReader.read(selected.uri.fsPath);
    const { start, end } = selected.range;
    return {
      content: content as string,
      kind: "text",
      metadata: {
        filePath: selected.uri.fsPath,
        highlightLine: selected.line - 1,
        // A multi-line reference range cannot be marked on a single line
        highlightRange: start.line === end.line ? { start: start.character, end: end.character } : undefined,
      },
    };
  }

  private async getReferences(): Promise<ReferenceInfo[]> {
    const ctx = PreContextManager.instance.getContext();
    if (!ctx) {
      vscode.window.showWarningMessage("No editor context captured. Please open a file first.");
      return [];
    }

    const { document, position } = ctx;
    const symbolName = document.getText(document.getWordRangeAtPosition(position));

    try {
      const locations = await vscode.commands.executeCommand<vscode.Location[]>(
        "vscode.executeReferenceProvider",
        document.uri,
        position,
      );

      if (!locations || locations.length === 0) {
        vscode.window.showInformationMessage("No references found at cursor position.");
        return [];
      }

      const refs = await Promise.all(
        locations.map(async (loc) => {
          const relativePath = vscode.workspace.asRelativePath(loc.uri);
          const line = loc.range.start.line + 1;

          let preview = "";
          try {
            const doc = await vscode.workspace.openTextDocument(loc.uri);
            preview = doc.lineAt(loc.range.start.line).text;
          } catch {}

          return {
            index: 0,
            uri: loc.uri,
            range: loc.range,
            relativePath,
            line,
            preview,
            symbolName,
          } satisfies ReferenceInfo;
        }),
      );

      refs.sort((a, b) => {
        const pathCmp = a.relativePath.localeCompare(b.relativePath);
        return pathCmp !== 0 ? pathCmp : a.line - b.line;
      });
      // Assigned after sorting so the index matches the position in cachedRefs across all chunks
      refs.forEach((ref, index) => {
        ref.index = index;
      });
      return refs;
    } catch (error) {
      vscode.window.showErrorMessage(`Error fetching references: ${error}`);
      return [];
    }
  }
}
