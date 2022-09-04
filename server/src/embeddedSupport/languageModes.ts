import {
  CompletionItem,
  Location,
  SignatureHelp,
  Definition,
  Diagnostic,
  Range,
  Hover,
  DocumentHighlight,
  CompletionList,
  Position,
  CodeActionContext,
  CodeAction,
  TextDocumentEdit
} from 'vscode-languageserver-types';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import { getLanguageModelCache, LanguageModelCache } from './languageModelCache';
import {
  getCoffeescriptDocumentRegions,
  CoffeescriptDocumentRegions,
  LanguageId,
  LanguageRange
} from './embeddedSupport';
import { getJavascriptMode } from '../modes/script/javascript';
import { DependencyService } from '../services/dependencyService';
import { nullMode } from '../modes/nullMode';
import { getServiceHost, IServiceHost } from '../services/typescriptService/serviceHost';
import { VCancellationToken } from '../utils/cancellationToken';
import { EnvironmentService } from '../services/EnvironmentService';
import { LANGUAGE_ID } from '../language';
import { DocumentService } from '../services/documentService';

export interface LSPServices {
  dependencyService: DependencyService;
  documentService: DocumentService;
}

export interface LanguageMode {
  getId(): string;
  updateFileInfo?(doc: TextDocument): void;

  doValidation?(document: TextDocument, cancellationToken?: VCancellationToken): Promise<Diagnostic[]>;
  getCodeActions?(document: TextDocument, range: Range, context: CodeActionContext): CodeAction[];
  doCodeActionResolve?(document: TextDocument, action: CodeAction): CodeAction;
  doComplete?(document: TextDocument, position: Position): CompletionList;
  doResolve?(document: TextDocument, item: CompletionItem): CompletionItem;
  doHover?(document: TextDocument, position: Position): Hover;
  doSignatureHelp?(document: TextDocument, position: Position): SignatureHelp | null;
  findDocumentHighlight?(document: TextDocument, position: Position): DocumentHighlight[];
  findDefinition?(document: TextDocument, position: Position): Definition;
  findReferences?(document: TextDocument, position: Position): Location[];

  onDocumentChanged?(filePath: string): void;
  onDocumentRemoved(document: TextDocument): void;
  dispose(): void;
}

export interface LanguageModeRange extends LanguageRange {
  mode: LanguageMode;
}

export class LanguageModes {
  private modes: { [k in LanguageId]: LanguageMode } = {
    [LANGUAGE_ID]: nullMode,
    javascript: nullMode,
    typescript: nullMode,
    unknown: nullMode
  };

  private documentRegions: LanguageModelCache<CoffeescriptDocumentRegions>;
  private modelCaches: LanguageModelCache<any>[];
  private serviceHost: IServiceHost;

  constructor() {
    this.documentRegions = getLanguageModelCache<CoffeescriptDocumentRegions>(10, 60, document =>
      getCoffeescriptDocumentRegions(document)
    );

    this.modelCaches = [];
    this.modelCaches.push(this.documentRegions);
  }

  async init(env: EnvironmentService, services: LSPServices) {
    const tsModule = services.dependencyService.get('typescript', env.getPackagePath()).module;

    /**
     * Documents where everything outside `<script>` is replaced with whitespace
     */
    const scriptRegionDocuments = getLanguageModelCache(10, 60, document => {
      const coffeescriptDocument = this.documentRegions.refreshAndGet(document);
      return coffeescriptDocument.getSingleTypeDocument('script');
    });
    this.serviceHost = getServiceHost(tsModule, env, scriptRegionDocuments);

    const jsMode = await getJavascriptMode(tsModule, this.serviceHost, env, this.documentRegions, services.dependencyService, services.documentService);

    this.modes['javascript'] = jsMode;
    this.modes['typescript'] = jsMode;
  }

  getModeAtPosition(document: TextDocument, position: Position): LanguageMode | undefined {
    const languageId = this.documentRegions.refreshAndGet(document).getLanguageAtPosition(position);
    return this.modes?.[languageId];
  }

  getAllLanguageModeRangesInDocument(document: TextDocument): LanguageModeRange[] {
    const result: LanguageModeRange[] = [];

    const documentRegions = this.documentRegions.refreshAndGet(document);

    documentRegions.getAllLanguageRanges().forEach(lr => {
      const mode = this.modes[lr.languageId];
      if (mode) {
        result.push({
          mode,
          ...lr
        });
      }
    });

    return result;
  }

  getAllModes(): LanguageMode[] {
    const result = [];
    for (const languageId in this.modes) {
      const mode = this.modes[<LanguageId>languageId];
      if (mode) {
        result.push(mode);
      }
    }
    return result;
  }

  getMode(languageId: LanguageId): LanguageMode | undefined {
    return this.modes[languageId];
  }

  onDocumentRemoved(document: TextDocument) {
    this.modelCaches.forEach(mc => mc.onDocumentRemoved(document));
    for (const mode in this.modes) {
      this.modes[<LanguageId>mode].onDocumentRemoved(document);
    }
  }

  dispose(): void {
    this.modelCaches.forEach(mc => mc.dispose());
    this.modelCaches = [];
    for (const mode in this.modes) {
      this.modes[<LanguageId>mode].dispose();
    }
    this.serviceHost.dispose();
  }
}
