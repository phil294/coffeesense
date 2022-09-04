import type ts from 'typescript';
import { CompletionItemKind } from 'vscode-languageserver';
import { EnvironmentService } from '../EnvironmentService';

export function isCoffeescriptFile(path: string, env: EnvironmentService) {
  return env.get_file_extensions().some(ext => path.endsWith(`.${ext}`))
}

/**
 * If the path ends with `.ext.ts`, it's a `.ext` file pre-processed by CoffeeSense
 * to be used in TS Language Service
 *
 * Note: all files outside any node_modules folder are considered,
 * EXCEPT if they are added to tsconfig via 'files' or 'include' properties
 *
 * See languageModelCache for notes about virtual
 */
export function isVirtualCoffeescriptFile(path: string, projectFiles: Set<string>, env: EnvironmentService) {
  return (
    env.get_file_extensions().some(ext => path.endsWith(`.${ext}.ts`)) &&
    (!path.includes('node_modules') || projectFiles.has(path.slice(0, -'.ts'.length)))
  );
}

export function findNodeByOffset(root: ts.Node, offset: number): ts.Node | undefined {
  if (offset < root.getStart() || root.getEnd() < offset) {
    return undefined;
  }

  const childMatch = root.getChildren().reduce<ts.Node | undefined>((matched, child) => {
    return matched || findNodeByOffset(child, offset);
  }, undefined);

  return childMatch ? childMatch : root;
}

export function toCompletionItemKind(kind: ts.ScriptElementKind): CompletionItemKind {
  switch (kind) {
    case 'primitive type':
    case 'keyword':
      return CompletionItemKind.Keyword;
    case 'var':
    case 'local var':
      return CompletionItemKind.Variable;
    case 'property':
    case 'getter':
    case 'setter':
      return CompletionItemKind.Field;
    case 'function':
    case 'method':
    case 'construct':
    case 'call':
    case 'index':
      return CompletionItemKind.Function;
    case 'enum':
      return CompletionItemKind.Enum;
    case 'module':
      return CompletionItemKind.Module;
    case 'class':
      return CompletionItemKind.Class;
    case 'interface':
      return CompletionItemKind.Interface;
    case 'warning':
      return CompletionItemKind.File;
    case 'script':
      return CompletionItemKind.File;
    case 'directory':
      return CompletionItemKind.Folder;
  }

  return CompletionItemKind.Property;
}
