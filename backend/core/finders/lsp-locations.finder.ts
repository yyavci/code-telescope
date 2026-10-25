import * as vscode from "vscode";
import { ReferenceFinderData, ReferenceInfo } from "../../../shared/exchange/lsp-refs";
import { TextPreviewData } from "../../../shared/extension-webview-protocol";
import { ChunkableProvider } from "../abstractions/chunkable-provider";
import { FileReader } from "../common/file-reader";
import { PreContextManager } from "../common/pre-context";
import { FuzzyFinderProvider } from "../decorators/fuzzy-finder-provider.decorator";
import { FuzzyFinderPanelController } from "../presentation/fuzzy-panel.controller";

/** Location commands VS Code exposes for the symbol at a position. */
export type LspLocationCommand =
  | "vscode.executeReferenceProvider"
  | "vscode.executeImplementationProvider"
  | "vscode.executeDefinitionProvider"
  | "vscode.executeTypeDefinitionProvider";

/**
 * Base for finders that list the locations a language server returns for the symbol at cursor
 * (references, implementations, definitions...). Subclasses only pick the command and wording.
 */
export abstract class LspLocationsFinder implements FuzzyFinderProvider, ChunkableProvider<ReferenceFinderData> {
  protected abstract readonly locationCommand: LspLocationCommand;
  /** Codicon shown in each row. */
  protected abstract readonly codicon: string;
  /** Shown when the language server returns nothing, e.g. "No references found". */
  protected abstract readonly emptyMessage: string;
  /** Opens a single result directly instead of listing it. */
  protected readonly jumpToSingleResult: boolean = false;

  private cachedRefs: ReferenceInfo[] | null = null;
  chunkSize = 2500;

  async onPanelClose(): Promise<void> {
    this.cachedRefs = null;
  }

  async querySelectableOptions(): Promise<ReferenceInfo[]> {
    const panel = FuzzyFinderPanelController.instance;
    this.cachedRefs = await this.getLocations();

    if (this.jumpToSingleResult && this.cachedRefs.length === 1) {
      const [location] = this.cachedRefs;
      this.cachedRefs = null;
      // The user may have closed the panel or opened another finder in it while the server answered
      const isPanelStillOurs =
        panel && FuzzyFinderPanelController.instance === panel && (panel.provider as unknown) === this;
      if (!isPanelStillOurs) return [];

      // The panel is already open while the language server answers, so close it before jumping
      panel.dispose();
      await this.openLocation(location);
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
      codicon: this.codicon,
    };
  }

  async onSelect(identifier: string): Promise<void> {
    const index = parseInt(identifier, 10);
    const selected = this.cachedRefs?.[index];
    if (!selected) return;

    await this.openLocation(selected);
  }

  async getPreviewData(identifier: string): Promise<TextPreviewData> {
    const index = parseInt(identifier, 10);
    const selected = this.cachedRefs?.[index];

    if (!selected) {
      return { content: "No location selected", kind: "text" };
    }

    const content = await FileReader.read(selected.uri.fsPath);
    const { start, end } = selected.range;
    return {
      content: content as string,
      kind: "text",
      metadata: {
        filePath: selected.uri.fsPath,
        highlightLine: selected.line - 1,
        // A multi-line range cannot be marked on a single line
        highlightRange: start.line === end.line ? { start: start.character, end: end.character } : undefined,
      },
    };
  }

  private async openLocation(location: ReferenceInfo): Promise<void> {
    const document = await vscode.workspace.openTextDocument(location.uri);
    const editor = await vscode.window.showTextDocument(document);
    const position = location.range.start;
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(location.range, vscode.TextEditorRevealType.InCenter);
  }

  /** Definition-like providers may answer with `LocationLink`s instead of `Location`s. */
  private static toLocation(item: vscode.Location | vscode.LocationLink): { uri: vscode.Uri; range: vscode.Range } {
    if ("targetUri" in item) {
      return { uri: item.targetUri, range: item.targetSelectionRange ?? item.targetRange };
    }
    return { uri: item.uri, range: item.range };
  }

  private async getLocations(): Promise<ReferenceInfo[]> {
    const ctx = PreContextManager.instance.getContext();
    if (!ctx) {
      vscode.window.showWarningMessage("No editor context captured. Please open a file first.");
      return [];
    }

    const { document, position } = ctx;
    // getText() without a range returns the whole document, so a cursor outside a word must not reach it
    const wordRange = document.getWordRangeAtPosition(position);
    const symbolName = wordRange ? document.getText(wordRange) : "";

    try {
      const results = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        this.locationCommand,
        document.uri,
        position,
      );

      if (!results || results.length === 0) {
        vscode.window.showInformationMessage(`${this.emptyMessage} at cursor position.`);
        return [];
      }

      const refs = await Promise.all(
        results.map(async (result) => {
          const { uri, range } = LspLocationsFinder.toLocation(result);

          let preview = "";
          try {
            const doc = await vscode.workspace.openTextDocument(uri);
            preview = doc.lineAt(range.start.line).text;
          } catch {}

          return {
            index: 0,
            uri,
            range,
            relativePath: vscode.workspace.asRelativePath(uri),
            line: range.start.line + 1,
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
      vscode.window.showErrorMessage(`Error fetching locations: ${error}`);
      return [];
    }
  }
}
