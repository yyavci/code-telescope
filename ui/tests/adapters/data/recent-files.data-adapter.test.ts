import { beforeEach, describe, expect, it } from "vitest";
import { RecentFileData } from "../../../../shared/exchange/recent-files";
import { RecentFileOption, RecentFilesFinderDataAdapter } from "../../../core/adapters/data/recent-files.data-adapter";

const buildOption = (file: Partial<RecentFileData>): RecentFileOption => ({
  index: 0,
  displayText: "",
  file: {
    kind: "file",
    path: "/workspace/src/app.ts",
    relativePath: "src/app.ts",
    lastModified: new Date(),
    exists: true,
    ...file,
  },
});

describe("RecentFilesFinderDataAdapter", () => {
  let adapter: RecentFilesFinderDataAdapter;

  beforeEach(() => {
    adapter = new RecentFilesFinderDataAdapter();
  });

  describe("getGlobPath", () => {
    it("matches globs against the relative path of files", () => {
      expect(adapter.getGlobPath(buildOption({}))).toBe("src/app.ts");
    });

    it("returns an empty path for terminals", () => {
      const option = buildOption({ kind: "terminal", path: "terminal://dev", relativePath: "[Terminal] dev" });

      expect(adapter.getGlobPath(option)).toBe("");
    });
  });

  describe("getHtmlWrapper", () => {
    it("mutes the directory part of file paths", () => {
      const html = adapter.getHtmlWrapper(buildOption({}), "src/app.ts");

      expect(html).toContain(`<span class="sk-muted">src/</span>app.ts`);
    });

    it("renders terminals with the terminal icon and no muting", () => {
      const option = buildOption({ kind: "terminal", path: "terminal://dev", relativePath: "[Terminal] dev" });

      const html = adapter.getHtmlWrapper(option, "[Terminal] dev");

      expect(html).toContain("codicon-terminal");
      expect(html).not.toContain("sk-muted");
    });
  });
});
