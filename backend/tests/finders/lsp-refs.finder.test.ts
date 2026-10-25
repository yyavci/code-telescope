import { ReferencesFinder } from "@backend/core/finders/lsp-refs.finder";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { PreContextManager } from "../../core/common/pre-context";

vi.mock("@backend/core/common/file-reader", () => ({
  FileReader: {
    read: vi.fn().mockResolvedValue("file content"),
  },
}));

function createLocation(path: string, line: number, startCharacter: number, endLine = line, endCharacter = 10) {
  return {
    uri: vscode.Uri.file(path),
    range: new vscode.Range(new vscode.Position(line, startCharacter), new vscode.Position(endLine, endCharacter)),
  };
}

describe("ReferencesFinder", () => {
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
});
