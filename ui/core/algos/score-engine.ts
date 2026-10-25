import { SessionStateManager } from "../common/code/state-manager";

function isWordBoundary(text: string, idx: number): boolean {
  if (idx === 0) return true;
  const prev = text.charCodeAt(idx - 1);
  return (
    prev === 47 || // /
    prev === 92 || // \
    prev === 95 || // _
    prev === 45 || // -
    prev === 46 || // .
    prev === 32 // space
  );
}

function isUpperCase(text: string, idx: number): boolean {
  const code = text.charCodeAt(idx);
  return code >= 65 && code <= 90;
}

function isLowerCase(text: string, idx: number): boolean {
  const code = text.charCodeAt(idx);
  return code >= 97 && code <= 122;
}

function isCamelCaseStart(text: string, idx: number): boolean {
  if (idx <= 0 || !isUpperCase(text, idx)) return false;
  return isLowerCase(text, idx - 1);
}

function getFilenameStart(text: string): number {
  const slash = text.lastIndexOf("/");
  const backslash = text.lastIndexOf("\\");
  return Math.max(slash, backslash) + 1;
}

/** Bonus for each query character matched in the file name, the part users usually search for. Paths only. */
const FILENAME_CHAR_BONUS = 4;
/**
 * Bonus for starting at the exact substring. It must outweigh the file-name-start bonus a scattered
 * match can collect, or `Re…pository` from `RecommendationRepository` beats the contiguous `Repository`.
 */
const EXACT_SUBSTRING_START_BONUS = 40;
/** Bonus for a substring-mode match inside the file name. */
const FILENAME_SUBSTRING_BONUS = 20;

/**
 * Index of the query as an exact substring. For paths it prefers an occurrence in the file name:
 * the first occurrence alone would give the exact-match bonus to a folder that happens to share
 * the name (`Repository/RecommendationRepository.cs`), highlighting and ranking it over the file name.
 * Free text (code previews, `name (container) path`) keeps the first occurrence, as its last `/`
 * may be in a comment or a division rather than before a file name.
 */
function findExactSubstringIdx(
  lowerText: string,
  lowerQuery: string,
  filenameStart: number,
  searchTextIsPath: boolean,
): number {
  const filenameIdx = searchTextIsPath ? lowerText.indexOf(lowerQuery, filenameStart) : -1;
  return filenameIdx !== -1 ? filenameIdx : lowerText.indexOf(lowerQuery);
}

type State = { score: number; lastIdx: number; prev: State | null };

export type MatchResult = { score: number; indices: number[] };

function buildIndices(state: State | null): number[] {
  const indices: number[] = [];
  let cursor = state;

  while (cursor && cursor.lastIdx >= 0) {
    indices.push(cursor.lastIdx);
    cursor = cursor.prev;
  }

  indices.reverse();
  return indices;
}

function computeStateScore(
  lowerQuery: string,
  text: string,
  state: State,
  foundIdx: number,
  qi: number,
  filenameStart: number,
  exactSubstringIdx: number,
  searchTextIsPath: boolean,
): number {
  const distance = foundIdx - state.lastIdx;
  let localScore = 0;

  if (qi > 0) {
    if (distance === 1) {
      localScore += 18;
    } else if (distance === 2) {
      localScore += 8;
    } else {
      localScore -= Math.min(distance - 1, 12);
    }
  } else {
    localScore -= Math.min(foundIdx, 18);
  }

  if (foundIdx === 0) localScore += 22;
  if (foundIdx === filenameStart) localScore += 60;
  if (isWordBoundary(text, foundIdx)) localScore += 18;
  if (isCamelCaseStart(text, foundIdx)) localScore += 10;

  if (exactSubstringIdx !== -1) {
    if (foundIdx === exactSubstringIdx && qi === 0) {
      localScore += EXACT_SUBSTRING_START_BONUS;
    }

    const exactEnd = exactSubstringIdx + lowerQuery.length;
    if (foundIdx >= exactSubstringIdx && foundIdx < exactEnd) {
      localScore += 6;
    }
  }

  // Only on the exact substring when there is one, so scattered file name characters (`Stat…Us…`)
  // cannot outscore a contiguous folder match (`Status/`) by collecting the bonus per character
  const isOnExactSubstring =
    exactSubstringIdx === -1 || (foundIdx >= exactSubstringIdx && foundIdx < exactSubstringIdx + lowerQuery.length);
  if (searchTextIsPath && foundIdx >= filenameStart && isOnExactSubstring) {
    localScore += FILENAME_CHAR_BONUS;
  }

  return state.score + localScore;
}

function computeBestMatch(lowerQuery: string, text: string, searchTextIsPath: boolean): MatchResult {
  const queryLen = lowerQuery.length;
  const textLen = text.length;

  if (queryLen > textLen || queryLen === 0) return { score: -Infinity, indices: [] };

  const lowerText = text.toLowerCase();
  const filenameStart = getFilenameStart(text);
  const exactSubstringIdx = findExactSubstringIdx(lowerText, lowerQuery, filenameStart, searchTextIsPath);
  const initialState: State = { score: 0, lastIdx: -1, prev: null };
  let best: State | null = null;

  // Try every occurrence of the first character, then greedily complete the
  // sequence. Paths are short, so this keeps basename/word-boundary quality
  // without allocating and sorting a beam of states for every character.
  let startIdx = lowerText.indexOf(lowerQuery[0]);
  while (startIdx !== -1) {
    let state: State = {
      score: computeStateScore(
        lowerQuery,
        text,
        initialState,
        startIdx,
        0,
        filenameStart,
        exactSubstringIdx,
        searchTextIsPath,
      ),
      lastIdx: startIdx,
      prev: initialState,
    };
    let matched = true;

    for (let qi = 1; qi < queryLen; qi++) {
      const foundIdx = lowerText.indexOf(lowerQuery[qi], state.lastIdx + 1);
      if (foundIdx === -1) {
        matched = false;
        break;
      }

      state = {
        score: computeStateScore(
          lowerQuery,
          text,
          state,
          foundIdx,
          qi,
          filenameStart,
          exactSubstringIdx,
          searchTextIsPath,
        ),
        lastIdx: foundIdx,
        prev: state,
      };
    }

    if (matched && (!best || state.score > best.score)) {
      best = state;
    }
    startIdx = lowerText.indexOf(lowerQuery[0], startIdx + 1);
  }

  return best ? { score: best.score, indices: buildIndices(best) } : { score: -Infinity, indices: [] };
}

function computeSubstringMatch(lowerQuery: string, text: string, searchTextIsPath: boolean): MatchResult {
  const lowerText = text.toLowerCase();
  const filenameStart = getFilenameStart(text);
  const idx = findExactSubstringIdx(lowerText, lowerQuery, filenameStart, searchTextIsPath);
  if (idx === -1) return { score: -Infinity, indices: [] };

  const indices = Array.from({ length: lowerQuery.length }, (_, i) => idx + i);
  const isInFilename = searchTextIsPath && idx >= filenameStart;
  // Measured from the file name start for a file name match, so a long directory does not push it down
  let score = -(isInFilename ? idx - filenameStart : idx);

  if (idx === 0) score += 15;
  if (isInFilename) score += FILENAME_SUBSTRING_BONUS;
  if (idx === filenameStart) score += 40;
  if (isWordBoundary(text, idx)) score += 12;

  return { score, indices };
}

/**
 * @param searchTextIsPath Enables the file name preferences, set by data adapters whose search text is a path.
 */
export function computeMatch(lowerQuery: string, text: string, searchTextIsPath = false): MatchResult {
  const algorithm = SessionStateManager.matchingAlgorithm;
  return algorithm === "subsequence"
    ? computeBestMatch(lowerQuery, text, searchTextIsPath)
    : computeSubstringMatch(lowerQuery, text, searchTextIsPath);
}

export function scoreMatch(lowerQuery: string, text: string, searchTextIsPath = false): number {
  if (!lowerQuery) return 0;
  if (!text) return -Infinity;
  return computeMatch(lowerQuery, text, searchTextIsPath).score;
}
