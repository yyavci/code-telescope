import * as vscode from "vscode";
import { PreviewHighlightRange, TextPreviewData } from "../../../../shared/extension-webview-protocol";
import { ChunkableProvider } from "../../abstractions/chunkable-provider";
import { FileReader } from "../../common/file-reader";
import { RipgrepTextFinder } from "../../common/rg/rg-text-finder";
import { FuzzyFinderAdapter, FuzzyFinderProvider } from "../../decorators/fuzzy-finder-provider.decorator";
import { RegexFinder } from "./regex-finder";

/**
 * Provides workspace-wide text search with dynamic querying.
 * Uses ripgrep when available and falls back to regex-based search.
 */
@FuzzyFinderAdapter({
  fuzzy: "workspace.text",
  previewRenderer: "preview.buffer",
  dataAdapter: "textSearchAdapter",
  name: "Search in Workspace",
  description: "Search for text across the entire workspace",
})
export class WorkspaceTextSearchProvider implements FuzzyFinderProvider, ChunkableProvider<{ results: any }> {
  public readonly supportsDynamicSearch = true;
  private readonly regexFinder: RegexFinder;
  private readonly ripgrepFinder: RipgrepTextFinder;
  public readonly chunkSize: number = 3500;
  public readonly concurrency = 16;

  usePreSelection = true;

  constructor() {
    this.regexFinder = new RegexFinder();
    this.ripgrepFinder = new RipgrepTextFinder();
  }

  async querySelectableOptions() {
    return [];
  }

  public mapChunk(chunk: any[]) {
    return {
      results: chunk,
    };
  }

  /**
   * Performs a dynamic search as the user types, streaming the results via generator.
   * Prefers ripgrep and falls back to regex search on failure.
   * The regex fallback cannot apply globs, so it is skipped when globs are set to avoid unfiltered results.
   */
  async *searchOnDynamicModeStream(
    query: string,
    customPaths?: string[],
    signal?: AbortSignal,
    globs?: string[],
  ): AsyncGenerator<any[]> {
    if (!query) return;

    const hasGlobs = !!globs && globs.length > 0;

    if (this.ripgrepFinder.ripgrepAvailable) {
      try {
        yield* this.ripgrepFinder.searchStream(query, customPaths, signal, globs);
        return;
      } catch (error) {
        if (signal?.aborted) return;
        if (hasGlobs) {
          // ripgrep rejects half-typed globs such as `*.{cs`
          console.error("ripgrep stream failed with globs, skipping regex fallback:", error);
          return;
        }
        console.error("ripgrep stream failed, falling back:", error);
      }
    } else if (hasGlobs) {
      console.warn("ripgrep is not available, globs require it and the regex fallback is skipped");
      return;
    }

    const result = await this.regexFinder.search(query, signal);
    if (signal?.aborted) return;
    if (result.results?.length > 0) yield result.results;
  }

  /**
   * Performs a dynamic search as the user types.
   * Prefers ripgrep and falls back to regex search on failure.
   */
  async searchOnDynamicMode(query: string, customPaths?: string[]): Promise<any> {
    if (!query) return [];

    let searchResult;
    if (this.ripgrepFinder.ripgrepAvailable) {
      try {
        searchResult = await this.ripgrepFinder.search(query, customPaths);
      } catch (error) {
        console.error("ripgrep search failed, falling back:", error);
        searchResult = await this.regexFinder.search(query);
      }
    } else {
      searchResult = await this.regexFinder.search(query);
    }

    const allMatches = searchResult.results;

    return {
      results: allMatches,
      query,
    };
  }

  static destructureIdentifier(identifier: string) {
    const parts = identifier.split("||");

    const filePath = parts[0];
    const lineStr = parts[1];
    const colStr = parts[2] || "1";
    const matchLengthStr = parts[3];

    return {
      filePath,
      lineStr,
      colStr,
      matchLengthStr,
    };
  }

  private static toHighlightRange(colStr: string, matchLengthStr?: string): PreviewHighlightRange | undefined {
    const start = parseInt(colStr, 10) - 1;
    const length = matchLengthStr ? parseInt(matchLengthStr, 10) : NaN;
    if (Number.isNaN(start) || Number.isNaN(length) || length <= 0) return undefined;
    return { start, end: start + length };
  }

  async getPreviewData(identifier: string): Promise<TextPreviewData> {
    const { filePath, lineStr, colStr, matchLengthStr } = WorkspaceTextSearchProvider.destructureIdentifier(identifier);

    try {
      const content = await FileReader.read(filePath);
      const lines = (content as string).split("\n");

      return {
        content: content as string,
        kind: "text",
        metadata: {
          filePath,
          highlightLine: lineStr ? parseInt(lineStr, 10) - 1 : undefined,
          highlightRange: WorkspaceTextSearchProvider.toHighlightRange(colStr, matchLengthStr),
          totalLines: lines.length,
        },
      };
    } catch {
      return {
        content: "Error loading file",
        kind: "text",
        metadata: {},
      };
    }
  }

  async onSelect(identifier: string) {
    const { filePath, lineStr, colStr } = WorkspaceTextSearchProvider.destructureIdentifier(identifier);
    const uri = vscode.Uri.file(filePath);
    const pos = new vscode.Position(parseInt(lineStr, 10) - 1, parseInt(colStr, 10) - 1);

    try {
      const editor = await vscode.window.showTextDocument(uri, {
        selection: new vscode.Range(pos, pos),
      });
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    } catch (err) {
      console.error("Erro ao abrir arquivo:", err);
    }
  }
}
