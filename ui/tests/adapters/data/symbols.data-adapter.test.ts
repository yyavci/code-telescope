import { describe, expect, it } from "vitest";
import { WorkspaceSymbolFinderData } from "../../../../shared/exchange/ws-symbols";
import { SymbolsFinderDataAdapter } from "../../../core/adapters/data/symbols.data-adapter";

describe("SymbolsFinderDataAdapter", () => {
  const adapter = new SymbolsFinderDataAdapter();

  it("returns identifier as selection value for workspace symbols", () => {
    const data: WorkspaceSymbolFinderData = {
      symbols: [
        {
          name: "UserService",
          containerName: "App.Services",
          kindName: "Class",
          codicon: "symbol-class",
          identifier: "file:///workspace/UserService.cs||9||17",
          relativePath: "src/UserService.cs",
        },
      ],
      displayTexts: ["UserService -> UserService.cs [App.Services]"],
    };

    const option = adapter.parseOptions(data)[0];

    expect(adapter.getSelectionValue(option)).toBe("file:///workspace/UserService.cs||9||17");
    expect(adapter.getGlobPath(option)).toBe("src/UserService.cs");
  });

  it("falls back to the index for document symbols", () => {
    const data: WorkspaceSymbolFinderData = {
      symbols: [
        { name: "first", containerName: "", kindName: "Function", codicon: "symbol-function" },
        { name: "second", containerName: "", kindName: "Function", codicon: "symbol-function" },
      ],
      displayTexts: ["first L1", "second L5"],
    };

    const option = adapter.parseOptions(data)[1];

    expect(adapter.getSelectionValue(option)).toBe("1");
  });
});
