import { platform } from 'os';
import { isAbsolute, resolve } from 'path';
import { URI } from 'vscode-uri';

/**
 * CoffeeSense mainly deals with paths / uris from two objects
 *
 * - `TextDocument` from `vscode-languageserver`
 * - `SourceFile` from `typescript`
 *
 * TypeScript Language Service uses `fileName`, which is a file path without scheme.
 * Convert them into standard URI by `Uri.file`.
 *
 * ## `TextDocument.uri`
 *
 * - macOS / Linux: file:///foo/bar.coffee
 * - Windows: file:///c%3A/foo/bar.coffee (%3A is `:`)
 *
 * ## `SourceFile.fileName`
 *
 * - macOS / Linux: /foo/bar.coffee
 * - Windows: c:/foo/bar.coffee
 *
 * ## vscode-uri
 *
 * - `Uri.parse`: Takes full URI starting with `file://`
 * - `Uri.file`: Takes file path
 *
 * ### `fsPath` vs `path`
 *
 * - macOS / Linux:
 * ```
 * > Uri.parse('file:///foo/bar.ext').fsPath
 * '/foo/bar.ext'
 * > Uri.parse('file:///foo/bar.ext').path
 * '/foo/bar.ext'
 * ```
 * - Windows
 * ```
 * > Uri.parse('file:///c%3A/foo/bar.ext').fsPath
 * 'c:\\foo\\bar.ext' (\\ escapes to \)
 * > Uri.parse('file:///c%3A/foo/bar.ext').path
 * '/c:/foo/bar.ext'
 * ```
 */

export function getFileFsPath(documentUri: string): string {
  return URI.parse(documentUri).fsPath;
}

export function getFilePath(documentUri: string): string {
  const IS_WINDOWS = platform() === 'win32';
  if (IS_WINDOWS) {
    // Windows have a leading slash like /C:/Users/pine
    // vscode-uri use lower-case drive letter
    // https://github.com/microsoft/vscode-uri/blob/95e03c06f87d38f25eda1ae3c343fe5b7eec3f52/src/index.ts#L1017
    return URI.parse(documentUri).path.replace(/^\/[a-zA-Z]/, (s: string) => s.slice(1).toLowerCase());
  } else {
    return URI.parse(documentUri).path;
  }
}

export function normalizeFileNameToFsPath(fileName: string) {
  return URI.file(fileName).fsPath;
}

export function normalizeFileNameResolve(...paths: string[]) {
  return normalizeFileNameToFsPath(resolve(...paths));
}

export function getPathDepth(filePath: string, sep: string) {
  return filePath.split(sep).length;
}

export function getFsPathToUri(fsPath: string) {
  return URI.file(fsPath).toString();
}

export function normalizeAbsolutePath(fsPath: string, root: string) {
  return isAbsolute(fsPath) ? normalizeFileNameToFsPath(fsPath) : normalizeFileNameResolve(root, fsPath);
}
