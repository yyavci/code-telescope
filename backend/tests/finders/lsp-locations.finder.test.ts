import { ImplementationsFinder } from "@backend/core/finders/lsp-implementations.finder";
import { ReferencesFinder } from "@backend/core/finders/lsp-refs.finder";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { PreContextManager } from "../../core/common/pre-context";
import { FuzzyFinderPanelController } from "../../core/presentation/fuzzy-panel.controller";

vi.mock("@backend/core/common/file-reader", () => ({
  FileReader: {
    read: vi.fn().mockResolvedValue("file content"),
  },
}));

vi.mock("@backend/core/presentation/fuzzy-panel.controller", () => ({
  FuzzyFinderPanelController: {
    instance: { dispose: vi.fn(), provider: undefined },
  },
}));

function createLocation(path: string, line: number, startCharacter: number, endLine = line, endCharacter = 10) {
  return {
    uri: vscode.Uri.file(path),
    range: new vscode.Range(new vscode.Position(line, startCharacter), new vscode.Position(endLine, endCharacter)),
  };
}

function createLocationLink(path: string, line: number, startCharacter: number, endCharacter: number) {
  const selectionRange = new vscode.Range(
    new vscode.Position(line, startCharacter),
    new vscode.Position(line, endCharacter),
  );
  return {
    targetUri: vscode.Uri.file(path),
    targetRange: new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line + 5, 1)),
    targetSelectionRange: selectionRange,
  };
}

describe("LspLocationsFinder", () => {
  let finder: ReferencesFinder;

  beforeEach(() => {
    vi.clearAllMocks();
    finder = new ReferencesFinder();
    vi.spyOn(PreContextManager.instance, "getContext").mockReturnValue({
      document: {
        uri: vscode.Uri.file("/workspace/src/a.ts"),
        getText: () => "target",
        getWordRangeAtPosition: () => undefined,
      },
      position: new vscode.Position(0, 0),
    } as any);
    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({
      lineAt: () => ({ text: "  target();" }),
    } as any);
  });

  it("assigns indexes in sorted order so selection matches the cached position", async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
      createLocation("src/b.ts", 4, 2),
      createLocation("src/a.ts", 9, 2),
      createLocation("src/a.ts", 1, 2),
    ]);

    const refs = await finder.querySelectableOptions();

    expect(refs.map((ref) => [ref.relativePath, ref.line, ref.index])).toEqual([
      ["src/a.ts", 2, 0],
      ["src/a.ts", 10, 1],
      ["src/b.ts", 5, 2],
    ]);
  });

  it("marks a single-line reference range in the preview", async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([createLocation("src/a.ts", 3, 2, 3, 8)]);
    await finder.querySelectableOptions();

    const preview = await finder.getPreviewData("0");

    expect(preview.metadata?.highlightLine).toBe(3);
    expect(preview.metadata?.highlightRange).toEqual({ start: 2, end: 8 });
  });

  it("does not mark a multi-line reference range", async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([createLocation("src/a.ts", 3, 2, 5, 1)]);
    await finder.querySelectableOptions();

    const preview = await finder.getPreviewData("0");

    expect(preview.metadata?.highlightRange).toBeUndefined();
  });

  it("normalizes location links to their selection range", async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([createLocationLink("src/a.ts", 7, 4, 12)]);

    const refs = await finder.querySelectableOptions();

    expect(refs[0].relativePath).toBe("src/a.ts");
    expect(refs[0].line).toBe(8);
    expect(refs[0].range.start).toEqual({ line: 7, character: 4 });
  });

  it("does not use the whole document as the symbol name when the cursor is outside a word", async () => {
    const getText = vi.fn(() => "entire document");
    vi.spyOn(PreContextManager.instance, "getContext").mockReturnValue({
      document: { uri: vscode.Uri.file("/workspace/src/a.ts"), getText, getWordRangeAtPosition: () => undefined },
      position: new vscode.Position(0, 0),
    } as any);
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([createLocation("src/a.ts", 1, 2)]);

    const refs = await finder.querySelectableOptions();

    expect(getText).not.toHaveBeenCalled();
    expect(refs[0].symbolName).toBe("");
  });

  it("lists a single reference instead of jumping to it", async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([createLocation("src/a.ts", 1, 2)]);

    const refs = await finder.querySelectableOptions();

    expect(refs).toHaveLength(1);
    expect(FuzzyFinderPanelController.instance!.dispose).not.toHaveBeenCalled();
  });

  describe("ImplementationsFinder", () => {
    it("closes the panel and jumps to a single result", async () => {
      const implementations = new ImplementationsFinder();
      (FuzzyFinderPanelController.instance as any).provider = implementations;
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([createLocation("src/impl.ts", 4, 2)]);

      const refs = await implementations.querySelectableOptions();

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "vscode.executeImplementationProvider",
        expect.anything(),
        expect.anything(),
      );
      expect(refs).toEqual([]);
      expect(FuzzyFinderPanelController.instance!.dispose).toHaveBeenCalledOnce();
      expect(vscode.window.showTextDocument).toHaveBeenCalledOnce();
    });

    it("lists multiple results", async () => {
      const implementations = new ImplementationsFinder();
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
        createLocation("src/a.ts", 4, 2),
        createLocation("src/b.ts", 4, 2),
      ]);

      const refs = await implementations.querySelectableOptions();

      expect(refs).toHaveLength(2);
      expect(FuzzyFinderPanelController.instance!.dispose).not.toHaveBeenCalled();
    });
    it("does not jump when the panel switched to another finder while waiting", async () => {
      const implementations = new ImplementationsFinder();
      (FuzzyFinderPanelController.instance as any).provider = new ReferencesFinder();
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([createLocation("src/impl.ts", 4, 2)]);

      const refs = await implementations.querySelectableOptions();

      expect(refs).toEqual([]);
      expect(FuzzyFinderPanelController.instance!.dispose).not.toHaveBeenCalled();
      expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
    });
  });
});
