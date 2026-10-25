/**
 * Default ripgrep flags applied to all searches.
 * Must contain only flags and their values (no positional arguments).
 */
const RIPGREP_BASE_FLAGS = [
  "--json",
  "--line-number",
  "--column",
  "--no-heading",
  "--text",
  "--hidden",
  "--color",
  "never",
  "--ignore-case",
] as const;

/**
 * Builds a valid ripgrep argument list.
 *
 * Rules:
 * - Exactly one query is required
 * - Query is always passed through `--regexp`, so a query starting with `-` is never parsed as a flag
 * - Paths are the only positional arguments and always come last
 */
export class RipgrepArgsBuilder {
  /** Ripgrep flags and values (no positional args). */
  private args: string[] = [...RIPGREP_BASE_FLAGS];
  private settingsExcludeArgs: string[] = [];
  private userIncludeArgs: string[] = [];
  private userExcludeArgs: string[] = [];
  private paths: string[] = [];

  /** Search pattern (required). */
  private _query?: string;

  /** Defines the search query (pattern). */
  query(q: string) {
    if (this._query) {
      throw new Error("RipgrepArgsBuilder: query already defined");
    }
    this._query = q;
    return this;
  }

  /** Sets the maximum number of columns per line. */
  maxColumns(v: number) {
    this.args.push("--max-columns", String(v));
    return this;
  }

  /** Sets the maximum file size to search. */
  maxFileSize(v: string) {
    this.args.push("--max-filesize", v);
    return this;
  }

  /** Adds glob exclusion patterns (settings and defaults). */
  exclude(patterns: string[]) {
    patterns.forEach((p) => this.settingsExcludeArgs.push("--glob", p.startsWith("!") ? p : `!${p}`));
    return this;
  }

  /** Adds globs typed by the user. A `!` prefix excludes, anything else includes. */
  userGlobs(globs: string[]) {
    globs.forEach((g) => {
      if (g.startsWith("!")) this.userExcludeArgs.push("--glob", g);
      else this.userIncludeArgs.push("--glob", g);
    });
    return this;
  }

  withPaths(paths: string[]) {
    this.paths = paths;
    return this;
  }

  withFixedStrings() {
    this.args.push("--fixed-strings");
    return this;
  }

  /** Builds the final argument list. */
  build() {
    if (!this._query) {
      throw new Error("RipgrepArgsBuilder: query is required");
    }

    const hasUserGlobs = this.userIncludeArgs.length > 0 || this.userExcludeArgs.length > 0;
    // Ripgrep gives the last matching --glob precedence, so the user globs are emitted first
    // and the settings excludes last: the user can narrow the search but never re-include excluded files.
    // --iglob is not an option, it is always evaluated after --glob and would override the settings excludes.
    const globArgs = [
      ...(hasUserGlobs ? ["--glob-case-insensitive"] : []),
      ...this.userIncludeArgs,
      ...this.userExcludeArgs,
      ...this.settingsExcludeArgs,
    ];

    return ["--regexp", this._query, ...this.args, ...globArgs, ...this.paths];
  }
}
