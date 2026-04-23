import {
  CodeAction,
  CodeActionParams,
  CompletionItem,
  CompletionList,
  CompletionParams,
  Definition,
  Diagnostic,
  DocumentHighlight,
  Hover,
  Location,
  SignatureHelp,
  TextDocumentEdit,
  TextDocumentPositionParams
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentSymbol } from 'vscode-languageserver-types';
import { LanguageId } from '../embeddedSupport/embeddedSupport';
import { LanguageModes } from '../embeddedSupport/languageModes';
import { NULL_COMPLETION, NULL_HOVER, NULL_SIGNATURE } from '../modes/nullMode';
import { CodeActionData } from '../types';
import { VCancellationToken } from '../utils/cancellationToken';
import { DependencyService } from './dependencyService';
import { DocumentService } from './documentService';
import { EnvironmentService } from './EnvironmentService';
import { LANGUAGE_ID } from '../language';

export interface ProjectService {
  env: EnvironmentService;
  languageModes: LanguageModes;
  onCompletion(params: CompletionParams): Promise<CompletionList>;
  onCompletionResolve(item: CompletionItem): Promise<CompletionItem>;
  onHover(params: TextDocumentPositionParams): Promise<Hover>;
  onDocumentHighlight(params: TextDocumentPositionParams): Promise<DocumentHighlight[]>;
  onDocumentSymbols(params: { textDocument: { uri: string } }): Promise<DocumentSymbol[]>;
  onDefinition(params: TextDocumentPositionParams): Promise<Definition>;
  onReferences(params: TextDocumentPositionParams): Promise<Location[]>;
  onSignatureHelp(params: TextDocumentPositionParams): Promise<SignatureHelp | null>;
  onCodeAction(params: CodeActionParams): Promise<CodeAction[]>;
  onCodeActionResolve(action: CodeAction): Promise<CodeAction>;
  doValidate(doc: TextDocument, cancellationToken?: VCancellationToken): Promise<Diagnostic[] | null>;
  dispose(): Promise<void>;
}

export async function createProjectService(
  env: EnvironmentService,
  documentService: DocumentService,
  dependencyService: DependencyService
): Promise<ProjectService> {
  const languageModes = new LanguageModes();

  await languageModes.init(env, {
    dependencyService,
    documentService,
  });

  return {
    env,
    languageModes,
    async onCompletion({ textDocument, position, context }) {
      const doc = documentService.getDocument(textDocument.uri)!;
      const mode = languageModes.getModeAtPosition(doc, position);
      if (mode && mode.doComplete) {
        return mode.doComplete(doc, position);
      }

      return NULL_COMPLETION;
    },
    async onCompletionResolve(item) {
      if (item.data) {
        const uri: string = item.data.uri;
        const languageId: LanguageId = item.data.languageId;

        if (uri && languageId) {
          const doc = documentService.getDocument(uri);
          const mode = languageModes.getMode(languageId);
          if (doc && mode && mode.doResolve) {
            return mode.doResolve(doc, item);
          }
        }
      }

      return item;
    },
    async onHover({ textDocument, position }) {
      const doc = documentService.getDocument(textDocument.uri)!;
      const mode = languageModes.getModeAtPosition(doc, position);
      if (mode && mode.doHover) {
        return mode.doHover(doc, position);
      }
      return NULL_HOVER;
    },
    async onDocumentHighlight({ textDocument, position }) {
      const doc = documentService.getDocument(textDocument.uri)!;
      const mode = languageModes.getModeAtPosition(doc, position);
      if (mode && mode.findDocumentHighlight) {
        return mode.findDocumentHighlight(doc, position);
      }
      return [];
    },
    async onDocumentSymbols({ textDocument }: { textDocument: { uri: string } }) {
      const doc = documentService.getDocument(textDocument.uri)!;
      const result: DocumentSymbol[] = [];
      if (doc && doc.languageId === LANGUAGE_ID) {
        for (const lmr of languageModes.getAllLanguageModeRangesInDocument(doc)) {
          const mode = lmr.mode;
          if (mode && mode.findDocumentSymbols) {
            const symbols = mode.findDocumentSymbols(doc);
            if (symbols && symbols.length) {
              result.push(...symbols);
            }
          }
        }
      }

      // Respect outline sort order if provided via workspace settings (e.g., VS Code's Outline view)
      try {
        const cfg = env.getConfig() as any;
        let sortOrder: string | undefined = undefined;
        // common locations for the setting
        if (cfg && cfg.outline && (cfg.outline.sortOrder || cfg.outline.sortBy)) {
          sortOrder = cfg.outline.sortOrder || cfg.outline.sortBy;
        }
        if (!sortOrder) sortOrder = cfg['outline.sortOrder'] || cfg['outline.sortBy'] || cfg['editor.outline.sortOrder'];

        const compareByPosition = (a: DocumentSymbol, b: DocumentSymbol) => {
          const as = doc.offsetAt(a.range.start);
          const bs = doc.offsetAt(b.range.start);
          return as - bs;
        };
        const compareByName = (a: DocumentSymbol, b: DocumentSymbol) =>
          (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
        const kindOrder = (k: number) => k || 0;
        const compareByCategory = (a: DocumentSymbol, b: DocumentSymbol) => {
          const ka = kindOrder(a.kind as number);
          const kb = kindOrder(b.kind as number);
          if (ka !== kb) return ka - kb;
          return compareByName(a, b);
        };

        const sorter = (order?: string) => {
          switch ((order || 'position').toString().toLowerCase()) {
            case 'name':
              return compareByName;
            case 'category':
            case 'kind':
              return compareByCategory;
            case 'position':
            default:
              return compareByPosition;
          }
        };

        const sortRec = (arr: DocumentSymbol[]) => {
          if (!arr || !arr.length) return;
          const cmp = sorter(sortOrder);
          arr.sort(cmp as any);
          for (const s of arr) {
            if (s.children) sortRec(s.children);
          }
        };

        sortRec(result);
      } catch (e) {
        // ignore sorting errors
      }

      return result;
    },


    async onDefinition({ textDocument, position }) {
      const doc = documentService.getDocument(textDocument.uri)!;
      const mode = languageModes.getModeAtPosition(doc, position);
      if (mode && mode.findDefinition) {
        return mode.findDefinition(doc, position);
      }
      return [];
    },
    async onReferences({ textDocument, position }) {
      const doc = documentService.getDocument(textDocument.uri)!;
      const mode = languageModes.getModeAtPosition(doc, position);
      if (mode && mode.findReferences) {
        return mode.findReferences(doc, position);
      }
      return [];
    },
    async onSignatureHelp({ textDocument, position }) {
      const doc = documentService.getDocument(textDocument.uri)!;
      const mode = languageModes.getModeAtPosition(doc, position);
      if (mode && mode.doSignatureHelp) {
        return mode.doSignatureHelp(doc, position);
      }
      return NULL_SIGNATURE;
    },
    async onCodeAction({ textDocument, range, context }: CodeActionParams) {
      const doc = documentService.getDocument(textDocument.uri)!;
      const mode = languageModes.getModeAtPosition(doc, range.start);
      if (languageModes.getModeAtPosition(doc, range.end) !== mode) {
        return [];
      }
      if (mode && mode.getCodeActions) {
        return mode.getCodeActions(doc, range, context);
      }
      return [];
    },
    async onCodeActionResolve(action) {
      const data = action.data as CodeActionData | undefined;
      if (data) {
        const uri: string = data.uri;
        const languageId: LanguageId = data.languageId;

        if (uri && languageId) {
          const doc = documentService.getDocument(uri);
          const mode = languageModes.getMode(languageId);
          if (doc && mode && mode.doCodeActionResolve) {
            return mode.doCodeActionResolve(doc, action);
          }
        }
      }

      return action;
    },
    async doValidate(doc: TextDocument, cancellationToken?: VCancellationToken) {
      const diagnostics: Diagnostic[] = [];
      if (doc.languageId === LANGUAGE_ID) {
        for (const lmr of languageModes.getAllLanguageModeRangesInDocument(doc)) {
          if (lmr.mode.doValidation) {
            diagnostics.push.apply(diagnostics, await lmr.mode.doValidation(doc, cancellationToken));
          }
        }
      }
      if (cancellationToken?.isCancellationRequested) {
        return null;
      }
      return diagnostics;
    },
    async dispose() {
      languageModes.dispose();
    }
  };
}
