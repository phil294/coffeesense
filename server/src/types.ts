import { LanguageId } from './embeddedSupport/embeddedSupport';

export interface DocumentContext {
  resolveReference(ref: string, base?: string): string;
}

export enum CodeActionDataKind {
  CombinedCodeFix,
  RefactorAction,
  OrganizeImports
}

export interface BaseCodeActionData {
  uri: string;
  languageId: LanguageId;
  kind: CodeActionDataKind;
  textRange: { pos: number; end: number };
}

export interface OrganizeImportsActionData extends BaseCodeActionData {
  kind: CodeActionDataKind.OrganizeImports;
}

export type CodeActionData = OrganizeImportsActionData;
