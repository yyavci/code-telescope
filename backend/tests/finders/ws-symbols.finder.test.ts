import { WorkspaceSymbolsFinder } from "@backend/core/finders/ws-symbols.finder";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { FileReader } from "../../core/common/file-reader";
import { execCmd } from "../../utils/commands";

vi.mock("@backend/utils/symbol", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/symbol")>()),
  getSymbolCodicon: vi.fn().mockReturnValue("symbol-method"),
}));

vi.mock("@backend/core/common/file-reader", () => ({
  FileReader: {
    read: vi.fn().mockResolvedValue("file content"),
  },
}));

vi.mock("@backend/utils/commands", () => ({
  execCmd: vi.fn(),
}));

const SYMBOL_URI = "file:///workspace/src/UserService.cs";

function createSymbol(name: string, line: number, character: number) {
  const uri = vscode.Uri.parse(SYMBOL_URI);
  return {
    name,
    kind: 4,
    containerName: "App.Services",
    location: {
      uri,
      range: { start: new vscode.Position(line, character), end: new vscode.Position(line, character + name.length) },
    },
  };
}

describe("WorkspaceSymbolsFinder", () => {
  let finder: WorkspaceSymbolsFinder;

  beforeEach(() => {
    vi.clearAllMocks();
    finder = new WorkspaceSymbolsFinder();
  });

  it("should support dynamic search", () => {
    expect(finder.supportsDynamicSearch).toBe(true);
  });

  describe("querySelectableOptions", () => {
    it("should return empty when no symbols", async () => {
      vi.mocked(execCmd).mockResolvedValue([]);

      const result = await finder.querySelectableOptions();

      expect(execCmd).toHaveBeenCalledWith("vscode.executeWorkspaceSymbolProvider", "");
      expect(result.symbols).toEqual([]);
      expect(result.displayTexts).toEqual([]);
    });
  });

  describe("searchOnDynamicMode", () => {
    it("should query the symbol provider with the prompt text", async () => {
      vi.mocked(execCmd).mockResolvedValue([createSymbol("UserService", 9, 17)]);

      const result = await finder.searchOnDynamicMode("UserServ");

      expect(execCmd).toHaveBeenCalledWith("vscode.executeWorkspaceSymbolProvider", "UserServ");
      expect(result.symbols).toHaveLength(1);
      expect(result.symbols[0].identifier).toBe(`${SYMBOL_URI}||9||17||UserService`);
      expect(result.symbols[0].kindName).toBe("Class");
      expect(result.symbols[0].relativePath).toBe(SYMBOL_URI);
      expect(result.displayTexts[0]).toBe(`${"UserService".padEnd(40)} -> ${SYMBOL_URI} [App.Services]`);
    });

    it("should return empty when the provider fails", async () => {
      vi.mocked(execCmd).mockRejectedValue(new Error("boom"));

      const result = await finder.searchOnDynamicMode("User");

      expect(result.symbols).toEqual([]);
      expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    });
  });

  describe("destructureIdentifier", () => {
    it("should parse uri and position", () => {
      const target = WorkspaceSymbolsFinder.destructureIdentifier(`${SYMBOL_URI}||9||17||UserService`);

      expect(target?.uri.toString()).toBe(SYMBOL_URI);
      expect(target?.position).toEqual({ line: 9, character: 17 });
      expect(target?.name).toBe("UserService");
    });

    it("decodes names containing the separator", () => {
      const identifier = WorkspaceSymbolsFinder.buildIdentifier(
        vscode.Uri.parse(SYMBOL_URI),
        new vscode.Position(1, 2),
        "operator ||",
      );

      expect(WorkspaceSymbolsFinder.destructureIdentifier(identifier)?.name).toBe("operator ||");
    });

    it("should keep the separator inside the uri part", () => {
      const target = WorkspaceSymbolsFinder.destructureIdentifier("file:///a||b.cs||3||4||Foo");

      expect(target?.uri.toString()).toBe("file:///a||b.cs");
      expect(target?.position).toEqual({ line: 3, character: 4 });
    });

    it("should reject malformed identifiers", () => {
      expect(WorkspaceSymbolsFinder.destructureIdentifier("999")).toBeUndefined();
      expect(WorkspaceSymbolsFinder.destructureIdentifier(`${SYMBOL_URI}||x||1||Foo`)).toBeUndefined();
    });
  });

  describe("onSelect", () => {
    it("should open the document at the symbol position without re-querying", async () => {
      const editor = { revealRange: vi.fn(), selection: undefined as any };
      vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({} as any);
      vi.mocked(vscode.window.showTextDocument).mockResolvedValue(editor as any);

      await finder.onSelect(`${SYMBOL_URI}||9||17||UserService`);

      expect(execCmd).not.toHaveBeenCalled();
      expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(expect.objectContaining({ fsPath: SYMBOL_URI }));
      expect(editor.selection.active).toEqual({ line: 9, character: 17 });
      expect(editor.revealRange).toHaveBeenCalled();
    });

    it("should do nothing for an invalid identifier", async () => {
      await finder.onSelect("999");

      expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
    });
  });

  describe("getPreviewData", () => {
    it("should return the file with the symbol line highlighted", async () => {
      const result = await finder.getPreviewData(`${SYMBOL_URI}||9||17||UserService`);

      expect(execCmd).not.toHaveBeenCalled();
      expect(result.content).toBe("file content");
      expect(result.metadata).toEqual({ filePath: SYMBOL_URI, highlightLine: 9, highlightRange: undefined });
    });

    it("marks the symbol name on the highlighted line", async () => {
      vi.mocked(FileReader.read).mockResolvedValueOnce("namespace App;\npublic class UserService {}");

      const result = await finder.getPreviewData(`${SYMBOL_URI}||1||0||UserService`);

      expect(result.metadata?.highlightRange).toEqual({ start: 13, end: 24 });
    });

    it("should return default message for an invalid identifier", async () => {
      const result = await finder.getPreviewData("999");

      expect(result.content).toBe("No symbol selected");
      expect(result.kind).toBe("text");
    });
  });
});
