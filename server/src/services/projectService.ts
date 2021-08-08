import {
  CodeAction,
  CodeActionParams,
  CompletionItem,
  CompletionList,
  CompletionParams,
  Definition,
  Diagnostic,
  DocumentHighlight,
  DocumentSymbolParams,
  FileRename,
  Hover,
  Location,
  SignatureHelp,
  SymbolInformation,
  TextDocumentEdit,
  TextDocumentPositionParams
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
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
  onDefinition(params: TextDocumentPositionParams): Promise<Definition>;
  onReferences(params: TextDocumentPositionParams): Promise<Location[]>;
  onDocumentSymbol(params: DocumentSymbolParams): Promise<SymbolInformation[]>;
  onSignatureHelp(params: TextDocumentPositionParams): Promise<SignatureHelp | null>;
  onCodeAction(params: CodeActionParams): Promise<CodeAction[]>;
  onCodeActionResolve(action: CodeAction): Promise<CodeAction>;
  onWillRenameFile(fileRename: FileRename): Promise<TextDocumentEdit[]>;
  doValidate(doc: TextDocument, cancellationToken?: VCancellationToken): Promise<Diagnostic[] | null>;
  dispose(): Promise<void>;
}

export async function createProjectService(
  env: EnvironmentService,
  documentService: DocumentService,
  dependencyService: DependencyService
): Promise<ProjectService> {
  const languageModes = new LanguageModes();

  function getValidationFlags(): Record<string, boolean> {
    const config = env.getConfig();
    return {
      javascript: config.coffeesense.validation.script
    };
  }

  await languageModes.init(env, {
    dependencyService
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
    async onDocumentSymbol({ textDocument }) {
      const doc = documentService.getDocument(textDocument.uri)!;
      const symbols: SymbolInformation[] = [];

      languageModes.getAllLanguageModeRangesInDocument(doc).forEach(m => {
        if (m.mode.findDocumentSymbols) {
          symbols.push.apply(symbols, m.mode.findDocumentSymbols(doc));
        }
      });
      return symbols;
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
      if (!env.getConfig().coffeesense.languageFeatures.codeActions) {
        return [];
      }

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
    async onWillRenameFile(fileRename: FileRename) {
      if (!env.getConfig().coffeesense.languageFeatures.updateImportOnFileMove) {
        return [];
      }

      const textDocumentEdit = languageModes.getMode('typescript')?.getRenameFileEdit?.(fileRename);

      return textDocumentEdit ?? [];
    },
    async doValidate(doc: TextDocument, cancellationToken?: VCancellationToken) {
      const diagnostics: Diagnostic[] = [];
      if (doc.languageId === LANGUAGE_ID) {
        const validationFlags = getValidationFlags();
        for (const lmr of languageModes.getAllLanguageModeRangesInDocument(doc)) {
          if (lmr.mode.doValidation) {
            if (validationFlags[lmr.mode.getId()]) {
              diagnostics.push.apply(diagnostics, await lmr.mode.doValidation(doc, cancellationToken));
            }
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
