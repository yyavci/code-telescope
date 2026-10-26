import { ImplementationsFinder } from "@backend/core/finders/lsp-implementations.finder";
import { ReferencesFinder } from "@backend/core/finders/lsp-refs.finder";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    setupProvider: vi.fn().mockResolvedValue(undefined),
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
  let cursorDocument: any;

  beforeEach(() => {
    vi.clearAllMocks();
    finder = new ReferencesFinder();
    cursorDocument = {
      uri: vscode.Uri.file("/workspace/src/a.ts"),
      getText: () => "target",
      getWordRangeAtPosition: () => undefined,
    };
    vi.spyOn(PreContextManager.instance, "getContext").mockReturnValue({
      document: cursorDocument,
      position: new vscode.Position(0, 0),
    } as any);
    (vscode.window as any).activeTextEditor = {
      document: cursorDocument,
      selection: { active: new vscode.Position(0, 0) },
    };
    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({
      lineAt: () => ({ text: "  target();" }),
    } as any);
  });

  afterEach(() => {
    (vscode.window as any).activeTextEditor = undefined;
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

  it("lists a single result when the panel itself queries it", async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue([createLocation("src/a.ts", 1, 2)]);

    const refs = await new ImplementationsFinder().querySelectableOptions();

    expect(refs).toHaveLength(1);
    expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
  });

  describe("openOrList", () => {
    it("opens a single result without opening the panel", async () => {
      const implementations = new ImplementationsFinder();
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([createLocation("src/impl.ts", 4, 2)]);

      await implementations.openOrList();

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "vscode.executeImplementationProvider",
        expect.anything(),
        expect.anything(),
      );
      expect(vscode.window.showTextDocument).toHaveBeenCalledOnce();
      expect(FuzzyFinderPanelController.setupProvider).not.toHaveBeenCalled();
    });

    it("does not open the panel when nothing is found", async () => {
      const implementations = new ImplementationsFinder();
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([]);

      await implementations.openOrList();

      expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
      expect(FuzzyFinderPanelController.setupProvider).not.toHaveBeenCalled();
    });

    it("opens the panel with the fetched results without asking the language server again", async () => {
      const implementations = new ImplementationsFinder();
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
        createLocation("src/a.ts", 4, 2),
        createLocation("src/b.ts", 4, 2),
      ]);

      await implementations.openOrList();
      const refs = await implementations.querySelectableOptions();

      expect(FuzzyFinderPanelController.setupProvider).toHaveBeenCalledWith("workspace.implementations");
      expect(refs).toHaveLength(2);
      expect(vscode.commands.executeCommand).toHaveBeenCalledOnce();
      expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
    });

    it("warns instead of querying when no editor is focused", async () => {
      const implementations = new ImplementationsFinder();
      (vscode.window as any).activeTextEditor = undefined;

      await implementations.openOrList();

      expect(vscode.window.showWarningMessage).toHaveBeenCalledOnce();
      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it("gives up when the cursor moved while the language server answered", async () => {
      const implementations = new ImplementationsFinder();
      vi.mocked(vscode.commands.executeCommand).mockImplementation(async () => {
        (vscode.window as any).activeTextEditor.selection = { active: new vscode.Position(5, 0) };
        return [createLocation("src/impl.ts", 4, 2)];
      });

      await implementations.openOrList();

      expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
      expect(FuzzyFinderPanelController.setupProvider).not.toHaveBeenCalled();
    });

    it("gives up when a panel opened while the language server answered", async () => {
      const implementations = new ImplementationsFinder();
      vi.mocked(vscode.commands.executeCommand).mockImplementation(async () => {
        (FuzzyFinderPanelController as any).instance = {};
        return [createLocation("src/a.ts", 4, 2), createLocation("src/b.ts", 4, 2)];
      });

      await implementations.openOrList();
      (FuzzyFinderPanelController as any).instance = undefined;

      expect(FuzzyFinderPanelController.setupProvider).not.toHaveBeenCalled();
    });

    it("queries again instead of reusing results fetched for another cursor", async () => {
      const implementations = new ImplementationsFinder();
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([
        createLocation("src/a.ts", 4, 2),
        createLocation("src/b.ts", 4, 2),
      ]);
      await implementations.openOrList();
      vi.spyOn(PreContextManager.instance, "getContext").mockReturnValue({
        document: cursorDocument,
        position: new vscode.Position(9, 0),
      } as any);
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue([createLocation("src/c.ts", 1, 2)]);

      const refs = await implementations.querySelectableOptions();

      expect(refs.map((ref) => ref.relativePath)).toEqual(["src/c.ts"]);
    });
  });
});
