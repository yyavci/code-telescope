import { FuzzyProviderType } from "../../shared/adapters-namespace";

export interface ParsedQueryGlobs {
  query: string;
  globs: string[];
}

const GLOB_FLAG = "-g";
const EXCLUDE_GLOB_PREFIX = "!";

/** Trailing `-g <glob>` pair. The glob is a single non-whitespace token. */
const TRAILING_GLOB_PATTERN = /(^|\s+)-g\s+(\S+)\s*$/;
/** Trailing `-g` or `-` without a value (the user is still typing the next flag). */
const TRAILING_INCOMPLETE_FLAG_PATTERN = /(^|\s+)-(g?)\s*$/;
/** Standalone `\-g` token, used to search for a literal `-g`. */
const ESCAPED_FLAG_PATTERN = /(^|\s)\\-g(?=\s|$)/g;

/**
 * Splits the finder input into the search query and a list of glob filters,
 * telescope live_grep_args style: `repository -g *.cs -g !*Test*.cs`.
 *
 * Only trailing `-g <glob>` pairs are parsed. A `-g` anywhere else, or one followed by a
 * dash-prefixed value (`gcc -g -O2`), stays part of the query. `\-g` searches for a literal `-g`.
 * A trailing bare `-g` is dropped as in-progress typing. A trailing lone `-` is only dropped
 * when a glob was parsed before it, so `repository -g *.cs -` keeps its glob while `foo -` stays as typed.
 * The input is returned untouched when there is nothing to parse or unescape.
 */
export function parseQueryGlobs(input: string): ParsedQueryGlobs {
  let query = input;
  const globs: string[] = [];

  const incompleteFlag = TRAILING_INCOMPLETE_FLAG_PATTERN.exec(query);
  if (incompleteFlag) {
    query = query.slice(0, incompleteFlag.index);
  }

  for (;;) {
    const pair = TRAILING_GLOB_PATTERN.exec(query);
    if (!pair || pair[2].startsWith("-")) break;
    globs.unshift(pair[2]);
    query = query.slice(0, pair.index);
  }

  const isLoneDash = incompleteFlag?.[2] === "";
  if (isLoneDash && globs.length === 0) query = input;

  query = query.replace(ESCAPED_FLAG_PATTERN, `$1${GLOB_FLAG}`);

  return { query, globs };
}

/** Providers that filter their list by glob in the webview, matching the adapter's path. */
const LOCAL_GLOB_PROVIDERS: readonly FuzzyProviderType[] = [
  "workspace.files",
  "workspace.recentFiles",
  "workspace.symbols",
  "git.diffs",
];

/** Whether the provider accepts `-g` globs in its input. */
function supportsQueryGlobs(provider: FuzzyProviderType): boolean {
  return provider === "workspace.text" || filtersGlobsLocally(provider);
}

/** Whether the webview applies the globs itself. The text finder passes them to ripgrep instead. */
export function filtersGlobsLocally(provider: FuzzyProviderType): boolean {
  return LOCAL_GLOB_PROVIDERS.includes(provider);
}

/** Parses the input only for providers that support globs, otherwise returns it as a plain query. */
export function parseProviderInput(input: string, provider: FuzzyProviderType): ParsedQueryGlobs {
  return supportsQueryGlobs(provider) ? parseQueryGlobs(input) : { query: input, globs: [] };
}

const REGEX_META_CHARS = /[.+^${}()|[\]\\*?]/g;

function escapeRegex(char: string): string {
  return char.replace(REGEX_META_CHARS, "\\$&");
}

/** Index of the `}` closing the `{` at `openIndex`, or -1 when it is never closed. */
function findClosingBrace(glob: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < glob.length; i++) {
    if (glob[i] === "\\") i++;
    else if (glob[i] === "{") depth++;
    else if (glob[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

/** Splits brace content on commas that are not nested inside another brace group. */
function splitAlternatives(content: string): string[] {
  const alternatives: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\\") i++;
    else if (content[i] === "{") depth++;
    else if (content[i] === "}") depth--;
    else if (content[i] === "," && depth === 0) {
      alternatives.push(content.slice(start, i));
      start = i + 1;
    }
  }
  alternatives.push(content.slice(start));
  return alternatives;
}

/** Index of the `]` closing the class opened at `openIndex`, or -1. A `]` right after `[` or `[!` is a member. */
function findClosingBracket(glob: string, openIndex: number): number {
  let i = openIndex + 1;
  if (glob[i] === "!" || glob[i] === "^") i++;
  if (glob[i] === "]") i++;
  return glob.indexOf("]", i);
}

/** Translates glob syntax into a regex source (no anchors). */
function globToRegexSource(glob: string): string {
  let source = "";

  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];

    if (char === "*") {
      if (glob[i + 1] !== "*") {
        source += "[^/]*";
        continue;
      }
      const atSegmentStart = i === 0 || glob[i - 1] === "/";
      if (atSegmentStart && glob[i + 2] === "/") {
        source += "(?:.*/)?";
        i += 2;
      } else {
        source += ".*";
        i++;
      }
    } else if (char === "?") {
      source += "[^/]";
    } else if (char === "{") {
      const closeIndex = findClosingBrace(glob, i);
      if (closeIndex === -1) {
        source += escapeRegex(char);
        continue;
      }
      const alternatives = splitAlternatives(glob.slice(i + 1, closeIndex));
      source += `(?:${alternatives.map(globToRegexSource).join("|")})`;
      i = closeIndex;
    } else if (char === "[") {
      const closeIndex = findClosingBracket(glob, i);
      if (closeIndex === -1) {
        source += escapeRegex(char);
        continue;
      }
      const negated = glob[i + 1] === "!" || glob[i + 1] === "^";
      const members = glob.slice(i + (negated ? 2 : 1), closeIndex).replace(/[\\[\]^]/g, "\\$&");
      source += negated ? `[^${members}/]` : `[${members}]`;
      i = closeIndex;
    } else if (char === "\\" && i + 1 < glob.length) {
      source += escapeRegex(glob[++i]);
    } else {
      source += escapeRegex(char);
    }
  }

  return source;
}

interface CompiledGlob {
  regex: RegExp;
  matchesFullPath: boolean;
}

/**
 * Compiles a glob. Without a `/` it matches the basename, otherwise the whole relative path.
 * Returns undefined when the glob does not compile.
 */
function compileGlob(glob: string): CompiledGlob | undefined {
  const matchesFullPath = glob.includes("/");
  // Collapse redundant wildcards (`***`, `**/**/`) to limit regex backtracking
  const pattern = (matchesFullPath ? glob.replace(/^\/+/, "") : glob)
    .replace(/\*{3,}/g, "**")
    .replace(/(?:\*\*\/){2,}/g, "**/");
  try {
    return { regex: new RegExp(`^${globToRegexSource(pattern)}$`, "i"), matchesFullPath };
  } catch {
    // e.g. a reversed class range like `[z-a]`
    return undefined;
  }
}

/**
 * Builds a path predicate from `-g` globs, with ripgrep/gitignore-like semantics.
 * `!`-prefixed globs exclude. With any include glob the path must match at least one of them,
 * and it must never match an exclude glob. Regexes are compiled once, so reuse the predicate
 * when filtering large lists.
 */
export function createGlobMatcher(globs: string[]): (path: string) => boolean {
  if (globs.length === 0) return () => true;

  const includes: CompiledGlob[] = [];
  const excludes: CompiledGlob[] = [];
  for (const glob of globs) {
    const isExclude = glob.startsWith(EXCLUDE_GLOB_PREFIX);
    const compiled = compileGlob(isExclude ? glob.slice(EXCLUDE_GLOB_PREFIX.length) : glob);
    // ripgrep rejects the whole search when any glob is invalid, so match nothing as well
    if (!compiled) return () => false;
    (isExclude ? excludes : includes).push(compiled);
  }

  return (path: string) => {
    const normalizedPath = path.replace(/\\/g, "/");
    const basename = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
    const matchesGlob = ({ regex, matchesFullPath }: CompiledGlob) =>
      regex.test(matchesFullPath ? normalizedPath : basename);

    if (includes.length > 0 && !includes.some(matchesGlob)) return false;
    return !excludes.some(matchesGlob);
  };
}
