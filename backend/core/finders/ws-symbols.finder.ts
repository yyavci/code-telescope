import * as vscode from "vscode";
import { TextPreviewData } from "../../../shared/extension-webview-protocol";
import { execCmd } from "../../utils/commands";
import { getSymbolCodicon } from "../../utils/symbol";
import { FileReader } from "../common/file-reader";
import { FuzzyFinderAdapter, FuzzyFinderProvider } from "../decorators/fuzzy-finder-provider.decorator";

const IDENTIFIER_SEPARATOR = "||";

interface WorkspaceSymbolData {
  name: string;
  kind: vscode.SymbolKind;
  kindName: string;
  codicon: string;
  containerName: string;
  location: vscode.Location;
  uri: vscode.Uri;
  identifier: string;
}

interface WorkspaceSymbolFinderData {
  symbols: WorkspaceSymbolData[];
  displayTexts: string[];
}

/**
 * Fuzzy provider that retrieves workspace symbols.
 *
 * Searches for symbols (classes, functions, variables, etc.) across the entire workspace.
 * The language server is queried with the prompt text on every change, because servers such as
 * Roslyn return nothing for an empty query.
 */
@FuzzyFinderAdapter({
  fuzzy: "workspace.symbols",
  previewRenderer: "preview.buffer",
  dataAdapter: "symbolsAdapter",
  name: "Workspace Symbols",
  description: "Search for symbols in your workspace",
})
export class WorkspaceSymbolsFinder implements FuzzyFinderProvider {
  public readonly supportsDynamicSearch = true;

  /**
   * Tries an empty query once so servers that support it (e.g. TypeScript) show an initial list.
   * The dynamic search handler skips empty queries, so this is the only empty request.
   */
  async querySelectableOptions(): Promise<WorkspaceSymbolFinderData> {
    return this.toFinderData(await this.getWorkspaceSymbols(""));
  }

  async searchOnDynamicMode(query: string): Promise<WorkspaceSymbolFinderData> {
    return this.toFinderData(await this.getWorkspaceSymbols(query));
  }

  async onSelect(identifier: string) {
    const target = WorkspaceSymbolsFinder.destructureIdentifier(identifier);
    if (!target) return;

    const document = await vscode.workspace.openTextDocument(target.uri);
    const editor = await vscode.window.showTextDocument(document);

    const range = new vscode.Range(target.position, target.position);
    editor.selection = new vscode.Selection(target.position, target.position);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  }

  async getPreviewData(identifier: string): Promise<TextPreviewData> {
    const target = WorkspaceSymbolsFinder.destructureIdentifier(identifier);

    if (!target) {
      return {
        content: "No symbol selected",
        kind: "text",
      };
    }

    const filePath = target.uri.fsPath;
    const content = await FileReader.read(filePath);

    return {
      content: content as string,
      kind: "text",
      metadata: {
        filePath,
        highlightLine: target.position.line,
      },
    };
  }

  /**
   * Builds `uri||line||character`. `Uri.toString()` percent-encodes `|`, so the separator cannot
   * appear inside the uri part.
   */
  static buildIdentifier(uri: vscode.Uri, position: vscode.Position): string {
    return [uri.toString(), position.line, position.character].join(IDENTIFIER_SEPARATOR);
  }

  static destructureIdentifier(identifier: string): { uri: vscode.Uri; position: vscode.Position } | undefined {
    const parts = identifier.split(IDENTIFIER_SEPARATOR);
    if (parts.length < 3) return undefined;

    const character = parseInt(parts.pop()!, 10);
    const line = parseInt(parts.pop()!, 10);
    if (Number.isNaN(line) || Number.isNaN(character)) return undefined;

    try {
      const uri = vscode.Uri.parse(parts.join(IDENTIFIER_SEPARATOR), true);
      return { uri, position: new vscode.Position(line, character) };
    } catch (error) {
      console.error(`Invalid workspace symbol identifier "${identifier}":`, error);
      return undefined;
    }
  }

  private toFinderData(symbols: WorkspaceSymbolData[]): WorkspaceSymbolFinderData {
    const displayTexts = symbols.map((symbol) => {
      const symbolName = symbol.name.padEnd(40);
      const container = symbol.containerName ? ` [${symbol.containerName}]` : "";
      const filePath = vscode.workspace.asRelativePath(symbol.uri);

      return `${symbolName} -> ${filePath}${container}`;
    });

    return {
      symbols,
      displayTexts,
    };
  }

  private async getWorkspaceSymbols(query: string): Promise<WorkspaceSymbolData[]> {
    try {
      const symbolInformation = await execCmd<vscode.SymbolInformation[]>(
        "vscode.executeWorkspaceSymbolProvider",
        query,
      );

      if (!symbolInformation) {
        return [];
      }

      return symbolInformation.map((symbol) => ({
        name: symbol.name,
        kind: symbol.kind,
        kindName: vscode.SymbolKind[symbol.kind],
        codicon: getSymbolCodicon(symbol.kind),
        containerName: symbol.containerName,
        location: symbol.location,
        uri: symbol.location.uri,
        identifier: WorkspaceSymbolsFinder.buildIdentifier(symbol.location.uri, symbol.location.range.start),
      }));
    } catch (error) {
      vscode.window.showErrorMessage(`Error fetching workspace symbols: ${error}`);
      return [];
    }
  }
}
