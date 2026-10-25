export function escapeHtml(str: string) {
  return str.replace(
    /[&<>"']/g,
    (c) =>
      (
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }) as Record<string, string>
      )[c],
  );
}

/** One visible character of highlighted html: a highlight span, an html entity or a plain character. */
const HIGHLIGHTED_CHAR_PATTERN = /<span class="highlight">(?:&[^;]+;|[^<])<\/span>|&[^;]+;|[^]/g;

/**
 * Splits the escaped html produced by the option highlighter after `charIndex` visible characters,
 * so the parts can be wrapped separately without breaking entities or highlight spans.
 */
export function splitHighlightedHtml(html: string, charIndex: number): [string, string] {
  if (charIndex <= 0) return ["", html];

  let visibleChars = 0;
  for (const match of html.matchAll(HIGHLIGHTED_CHAR_PATTERN)) {
    if (visibleChars === charIndex) {
      return [html.slice(0, match.index), html.slice(match.index)];
    }
    visibleChars++;
  }
  return [html, ""];
}

function getFileNameStart(path: string): number {
  return Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1;
}

/** Wraps the directory part of a highlighted path in a muted span, keeping the file name prominent. */
export function muteDirectoryHtml(path: string, highlightedPath: string): string {
  const fileNameStart = getFileNameStart(path);
  if (fileNameStart === 0) return highlightedPath;

  const [directory, fileName] = splitHighlightedHtml(highlightedPath, fileNameStart);
  return `<span class="sk-muted">${directory}</span>${fileName}`;
}

/** Left-to-right marks around the directory, so the right-to-left box used to cut it from the left keeps `/` and `.` in place. */
const LEFT_TO_RIGHT_MARK = "&lrm;";

/**
 * Moves the file name of a highlighted path before its muted directory. A long path that does not fit
 * is cut at the start of the directory (`…Business/Rules`) instead of the file name.
 * The trailing separator of the directory is dropped.
 */
export function fileNameFirstHtml(path: string, highlightedPath: string): string {
  const fileNameStart = getFileNameStart(path);
  if (fileNameStart === 0) return highlightedPath;

  const [directoryWithSeparator, fileName] = splitHighlightedHtml(highlightedPath, fileNameStart);
  const [directory] = splitHighlightedHtml(directoryWithSeparator, fileNameStart - 1);
  // A file at the filesystem root (`/a.cs`) has nothing left to show after the separator
  if (directory === "") return fileName;
  return (
    `<span class="sk-path-filename-first"><span class="sk-path-file">${fileName}</span>` +
    `<span class="sk-muted sk-path-directory">${LEFT_TO_RIGHT_MARK}${directory}${LEFT_TO_RIGHT_MARK}</span></span>`
  );
}

const FILENAME_FIRST_DISPLAY = "filename-first";

/**
 * Renders a highlighted file path as the `codeTelescope.wsFileFinder.textDisplay` setting asks.
 * The global is only defined by layouts that inject it, so a missing one falls back to the default.
 */
export function formatFilePathHtml(path: string, highlightedPath: string): string {
  const pathDisplay = typeof __FILE_PATH_DISPLAY__ === "undefined" ? undefined : __FILE_PATH_DISPLAY__;
  return pathDisplay === FILENAME_FIRST_DISPLAY
    ? fileNameFirstHtml(path, highlightedPath)
    : muteDirectoryHtml(path, highlightedPath);
}

export function toInnerHTML(text: string): string {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function formatFileOptionHtml(svgIconUrl: string, text: string): string {
  return `
    <i class="file-icon">
      <img 
        src="${svgIconUrl}" 
        alt="" 
        loading="eager" 
        decoding="async"
        width="16"
        height="16"
      />
    </i>
    <span class="file-path">${text}</span>
`;
}
