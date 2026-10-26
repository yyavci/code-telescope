import * as vscode from "vscode";
import { IFuzzyFinderProvider } from "../../../shared/abstractions/fuzzy-finder.provider";
import { ReferenceFinderData, ReferenceInfo } from "../../../shared/exchange/lsp-refs";
import { TextPreviewData } from "../../../shared/extension-webview-protocol";
import { ChunkableProvider } from "../abstractions/chunkable-provider";
import { FileReader } from "../common/file-reader";
import { PreContextManager } from "../common/pre-context";
import { FuzzyFinderProvider } from "../decorators/fuzzy-finder-provider.decorator";
import { FuzzyFinderPanelController } from "../presentation/fuzzy-panel.controller";

const NO_ACTIVE_EDITOR_MESSAGE = "Focus an editor to find locations of the symbol at cursor.";
const LANGUAGE_SERVER_PROGRESS_TITLE = "Code Telescope: waiting for the language server";

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

  private cachedRefs: ReferenceInfo[] | null = null;
  /** Results fetched by `openOrList` before the panel opened, consumed by the panel's first query. */
  private prefetched: { refs: ReferenceInfo[]; document: vscode.TextDocument; position: vscode.Position } | null = null;
  chunkSize = 2500;

  async onPanelClose(): Promise<void> {
    this.cachedRefs = null;
    this.prefetched = null;
  }

  async querySelectableOptions(): Promise<ReferenceInfo[]> {
    const prefetched = this.prefetched;
    this.prefetched = null;
    // The panel may open later without openOrList (builtin list, resume), so results for another cursor must not leak in
    const ctx = PreContextManager.instance.getContext();
    const isPrefetchedCurrent =
      prefetched && ctx && LspLocationsFinder.isSameCursor(prefetched.document, prefetched.position, ctx);
    this.cachedRefs = isPrefetchedCurrent ? prefetched.refs : await this.getLocations();
    return this.cachedRefs;
  }

  /**
   * Asks the language server before opening the panel: a single result is opened directly and the panel
   * only shows up for several, so it never flashes open and closed.
   */
  async openOrList(): Promise<void> {
    // Without a focused editor the captured context is from an earlier position, so do not query it
    if (!vscode.window.activeTextEditor) {
      vscode.window.showWarningMessage(NO_ACTIVE_EDITOR_MESSAGE);
      return;
    }

    PreContextManager.instance.captureFromActiveEditor();
    const ctx = PreContextManager.instance.getContext();
    const panelBeforeQuery = FuzzyFinderPanelController.instance;

    const refs = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: LANGUAGE_SERVER_PROGRESS_TITLE },
      () => this.getLocations(),
    );

    // getLocations already told the user why nothing was found
    if (!ctx || refs.length === 0) return;

    // Like VS Code's own Go to Definition, give up when the user moved on while the server answered
    const activeEditor = vscode.window.activeTextEditor;
    const userMovedOn =
      FuzzyFinderPanelController.instance !== panelBeforeQuery ||
      !activeEditor ||
      !LspLocationsFinder.isSameCursor(activeEditor.document, activeEditor.selection.active, ctx);
    if (userMovedOn) return;

    if (refs.length === 1) {
      await this.openLocation(refs[0]);
      return;
    }

    this.prefetched = { refs, document: ctx.document, position: ctx.position };
    await FuzzyFinderPanelController.setupProvider((this as unknown as IFuzzyFinderProvider).fuzzyAdapterType);
  }

  private static isSameCursor(
    document: vscode.TextDocument,
    position: vscode.Position,
    ctx: { document: vscode.TextDocument; position: vscode.Position },
  ): boolean {
    return (
      document === ctx.document && position.line === ctx.position.line && position.character === ctx.position.character
    );
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
