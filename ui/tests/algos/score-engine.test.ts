import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeMatch, scoreMatch } from "../../core/algos/score-engine";
import { SessionStateManager } from "../../core/common/code/state-manager";

describe("score-engine", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("prefers basename matches over directory-only matches", () => {
    vi.spyOn(SessionStateManager, "matchingAlgorithm", "get").mockReturnValue("subsequence");

    const basename = scoreMatch("cmp", "src/components/ComponentCard.tsx");
    const directoryOnly = scoreMatch("cmp", "components/src/container.tsx");

    expect(basename).toBeGreaterThan(directoryOnly);
  });

  it("supports Windows path basename anchoring", () => {
    vi.spyOn(SessionStateManager, "matchingAlgorithm", "get").mockReturnValue("subsequence");

    const winPath = scoreMatch("app", "src\\pages\\AppShell.tsx");
    const nestedOnly = scoreMatch("app", "app\\pages\\shell.tsx");

    expect(winPath).toBeGreaterThan(nestedOnly);
  });

  it("favors earlier exact substring matches in substring mode", () => {
    vi.spyOn(SessionStateManager, "matchingAlgorithm", "get").mockReturnValue("substring");

    const exact = scoreMatch("diff", "src/git-diff.finder.ts");
    const later = scoreMatch("diff", "src/finders/git/current-diff.ts");

    expect(exact).toBeGreaterThan(later);
  });

  it("returns a valid ordered index path for the winning match", () => {
    vi.spyOn(SessionStateManager, "matchingAlgorithm", "get").mockReturnValue("subsequence");

    const query = "gdf";
    const text = "git-diff.finder.ts";
    const result = computeMatch(query, text);

    expect(result.indices).toHaveLength(query.length);
    expect([...query]).toEqual(result.indices.map((idx) => text[idx].toLowerCase()));
    expect(result.indices.every((idx, i, arr) => i === 0 || idx > arr[i - 1])).toBe(true);
    expect(result.score).toBeGreaterThan(-Infinity);
  });

  it("highlights the file name when a folder has the same name", () => {
    vi.spyOn(SessionStateManager, "matchingAlgorithm", "get").mockReturnValue("subsequence");

    const text = "Data/Repository/RecommendationRepository.cs";
    const result = computeMatch("repository", text, true);

    expect(result.indices[0]).toBe(text.lastIndexOf("Repository"));
  });

  it("ranks a file name match above a folder-only match", () => {
    vi.spyOn(SessionStateManager, "matchingAlgorithm", "get").mockReturnValue("subsequence");

    const fileName = scoreMatch("repository", "Sok.Replay/Engine/InMemoryRecommendationRepository.cs", true);
    const folderOnly = scoreMatch("repository", "Sok.Data/Repository/ISnapshotReader.cs", true);

    expect(fileName).toBeGreaterThan(folderOnly);
  });

  it("prefers the file name occurrence in substring mode", () => {
    vi.spyOn(SessionStateManager, "matchingAlgorithm", "get").mockReturnValue("substring");

    const text = "Data/Repository/RecommendationRepository.cs";
    const result = computeMatch("repository", text, true);

    expect(result.indices[0]).toBe(text.lastIndexOf("Repository"));
    expect(scoreMatch("repository", "a/very/long/path/to/Engine/UserRepository.cs", true)).toBeGreaterThan(
      scoreMatch("repository", "Data/Repository/ISnapshotReader.cs", true),
    );
  });

  it("keeps a contiguous folder match over scattered file name characters", () => {
    vi.spyOn(SessionStateManager, "matchingAlgorithm", "get").mockReturnValue("subsequence");

    const text = "Sok.Data/Status/StateUser.cs";
    const result = computeMatch("status", text, true);

    expect(result.indices[0]).toBe(text.indexOf("Status"));
  });

  it.each(["subsequence", "substring"] as const)("keeps the first occurrence in free text (%s)", (algorithm) => {
    vi.spyOn(SessionStateManager, "matchingAlgorithm", "get").mockReturnValue(algorithm);

    const preview = "const user = load(); // admin/user";
    const result = computeMatch("user", preview);

    expect(result.indices[0]).toBe(preview.indexOf("user"));
  });
});
