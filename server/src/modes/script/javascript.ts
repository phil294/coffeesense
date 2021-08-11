import { LanguageModelCache, getLanguageModelCache } from '../../embeddedSupport/languageModelCache';
import {
  SymbolInformation,
  CompletionItem,
  Location,
  SignatureHelp,
  SignatureInformation,
  ParameterInformation,
  Definition,
  TextEdit,
  Diagnostic,
  DiagnosticSeverity,
  Range,
  CompletionItemKind,
  Hover,
  MarkedString,
  DocumentHighlight,
  DocumentHighlightKind,
  CompletionList,
  Position,
  DiagnosticTag,
  MarkupContent,
  CodeAction,
  CodeActionKind,
  CompletionItemTag,
  CodeActionContext
} from 'vscode-languageserver-types';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { LanguageMode } from '../../embeddedSupport/languageModes';
import { CoffeescriptDocumentRegions, LanguageRange, LanguageId } from '../../embeddedSupport/embeddedSupport';
import { getFileFsPath, getFilePath } from '../../utils/paths';

import { URI } from 'vscode-uri';
import type ts from 'typescript';

import { NULL_SIGNATURE } from '../nullMode';
import { DependencyService, RuntimeLibrary } from '../../services/dependencyService';
import { CodeActionData, CodeActionDataKind, OrganizeImportsActionData } from '../../types';
import { IServiceHost } from '../../services/typescriptService/serviceHost';
import { toCompletionItemKind, toSymbolKind } from '../../services/typescriptService/util';
import * as Previewer from './previewer';
import { isVCancellationRequested, VCancellationToken } from '../../utils/cancellationToken';
import { EnvironmentService } from '../../services/EnvironmentService';
import { FILE_EXTENSION, LANGUAGE_ID } from '../../language';
import transpile_service from '../../services/transpileService';
import { LineMap } from 'coffeescript';

export async function getJavascriptMode(
  serviceHost: IServiceHost,
  env: EnvironmentService,
  documentRegions: LanguageModelCache<CoffeescriptDocumentRegions>,
  dependencyService: DependencyService
): Promise<LanguageMode> {
  const jsDocuments = getLanguageModelCache(10, 60, document => {
    const coffeescriptDocument = documentRegions.refreshAndGet(document);
    return coffeescriptDocument.getSingleTypeDocument('script');
  });

  const tsModule: RuntimeLibrary['typescript'] = dependencyService.get('typescript').module;

  const { updateCurrentCoffeescriptTextDocument } = serviceHost;
  let supportedCodeFixCodes: Set<number>;

  function getUserPreferences(scriptDoc: TextDocument): ts.UserPreferences {
    return getUserPreferencesByLanguageId(scriptDoc.languageId);
  }
  function getUserPreferencesByLanguageId(languageId: string): ts.UserPreferences {
    const baseConfig = env.getConfig()[languageId === 'javascript' ? 'javascript' : 'typescript'];
    const preferencesConfig = baseConfig?.preferences;

    if (!baseConfig || !preferencesConfig) {
      return {};
    }

    function safeGetConfigValue<V extends string | boolean, A extends Array<V>, D = undefined>(
      configValue: any,
      allowValues: A,
      defaultValue?: D
    ) {
      return allowValues.includes(configValue) ? (configValue as A[number]) : (defaultValue as D);
    }

    return {
      quotePreference: 'auto',
      importModuleSpecifierPreference: safeGetConfigValue(preferencesConfig.importModuleSpecifier, [
        'relative',
        'non-relative'
      ]),
      importModuleSpecifierEnding: safeGetConfigValue(
        preferencesConfig.importModuleSpecifierEnding,
        ['minimal', 'index', 'js'],
        'auto'
      ),
      allowTextChangesInNewFiles: true,
      providePrefixAndSuffixTextForRename:
        preferencesConfig.renameShorthandProperties === false ? false : preferencesConfig.useAliasesForRenames,
      // @ts-expect-error
      allowRenameOfImportPath: true,
      includeAutomaticOptionalChainCompletions: baseConfig.suggest.includeAutomaticOptionalChainCompletions ?? true,
      provideRefactorNotApplicableReason: true
    };
  }

  return {
    getId() {
      return 'javascript';
    },
    async doValidation(doc: TextDocument, cancellationToken?: VCancellationToken): Promise<Diagnostic[]> {
      if (await isVCancellationRequested(cancellationToken)) {
        return [];
      }
      const { scriptDoc, service } = updateCurrentCoffeescriptTextDocument(doc);
      if (!languageServiceIncludesFile(service, doc.uri)) {
        return [];
      }

      if (await isVCancellationRequested(cancellationToken)) {
        return [];
      }

      const transpilation = transpile_service.result_by_uri.get(doc.uri)
      if(!transpilation)
        return []
      if(transpilation.diagnostics)
        return transpilation.diagnostics || []

      const fileFsPath = getFileFsPath(doc.uri);
      const program = service.getProgram();
      const sourceFile = program?.getSourceFile(fileFsPath);
      if (!program || !sourceFile) {
        return [];
      }

      let rawScriptDiagnostics = [
        ...program.getSyntacticDiagnostics(sourceFile, cancellationToken?.tsToken),
        ...program.getSemanticDiagnostics(sourceFile, cancellationToken?.tsToken),
        ...service.getSuggestionDiagnostics(fileFsPath)
      ];

      const compilerOptions = program.getCompilerOptions();
      if (compilerOptions.declaration || compilerOptions.composite) {
        rawScriptDiagnostics = [
          ...rawScriptDiagnostics,
          ...program.getDeclarationDiagnostics(sourceFile, cancellationToken?.tsToken)
        ];
      }

      return rawScriptDiagnostics.map(diag => {
        const tags: DiagnosticTag[] = [];

        if (diag.reportsUnnecessary) {
          tags.push(DiagnosticTag.Unnecessary);
        }
        if (diag.reportsDeprecated) {
          tags.push(DiagnosticTag.Deprecated);
        }

        let range = convertRange(scriptDoc, diag as ts.TextSpan)
        if(transpilation.source_map)
          range = transpile_service.map_range(transpilation.source_map, range)

        // syntactic/semantic diagnostic always has start and length
        // so we can safely cast diag to TextSpan
        return <Diagnostic>{
          range,
          severity: convertTSDiagnosticCategoryToDiagnosticSeverity(tsModule, diag.category),
          message: tsModule.flattenDiagnosticMessageText(diag.messageText, '\n'),
          tags,
          code: diag.code,
          source: 'CoffeeSense [TS]'
        };
      });
    },
    doComplete(coffee_doc: TextDocument, coffee_position: Position): CompletionList {
      const { scriptDoc: js_doc, service } = updateCurrentCoffeescriptTextDocument(coffee_doc);
      if (!languageServiceIncludesFile(service, coffee_doc.uri)) {
        return { isIncomplete: false, items: [] };
      }
      const fileFsPath = getFileFsPath(coffee_doc.uri);

      const transpilation = transpile_service.result_by_uri.get(coffee_doc.uri)
      if(!transpilation)
        return { isIncomplete: false, items: [] }
      
      const coffee_last_char = coffee_doc.getText()[coffee_doc.offsetAt(coffee_position) - 1]
      let position: Position
      if(transpilation.source_map) {
        // For position reverse mapping, remove . char, and add again to result afterwards.
        // Otherwise, the source map does not know what you're talking of
        const coffee_position_excl_trigger_char = {
          line: coffee_position.line,
          character: coffee_position.character - (coffee_last_char==='.'? 1 : 0)
        }
        const js_position = transpile_service.reverse_map_position(transpilation, coffee_position_excl_trigger_char)
        if(!js_position)
          return { isIncomplete: false, items: [] }
        position = {
          line: js_position.line,
          character: js_position.character + (coffee_last_char==='.'? 1 : 0)
        }
      } else {
        // If no source map, the file is passed as coffee text which must not be mapped
        position = coffee_position
      }

      let js_offset = js_doc.offsetAt(position);
      if(position.character > 1000) // End of line (Number.MAX_VALUE)
        js_offset--
        
      let char_offset = 0
      const js_text = js_doc.getText()
      const js_last_char = js_text[js_offset - 1]
      const js_next_char = js_text[js_offset]
      // When CS cursor is e.g. at `a('|')`, completion does not work bc of bad source mapping,
      // JS cursor is falsely `a(|'')`. Circumvent this:
      const special_trigger_chars = ['"', "'"]
      for(const s of special_trigger_chars) {
        if(coffee_last_char === s && js_last_char !== s && js_next_char === s) {
          char_offset += 1
          break
        }
      }
      js_offset += char_offset
      
      const completions = service.getCompletionsAtPosition(fileFsPath, js_offset, {
        ...getUserPreferences(js_doc),
        triggerCharacter: getTsTriggerCharacter(coffee_last_char),
        includeCompletionsWithInsertText: true,
        includeCompletionsForModuleExports: true
      });

      if (!completions) {
        return { isIncomplete: false, items: [] };
      }
      return {
        isIncomplete: false,
        items: completions.entries.map((entry, index) => {
          let range = entry.replacementSpan && convertRange(js_doc, entry.replacementSpan);
          if(range) {
            if(transpilation.source_map)
              range = transpile_service.map_range(transpilation.source_map, range)
            range.start.character += char_offset
            range.end.character += char_offset
            // Or maybe do not calculate range at all, just set to coffee_position + entry length? Should work too
          }
          
          const { label, detail } = calculateLabelAndDetailTextForPathImport(entry);

          const item: CompletionItem = {
            uri: coffee_doc.uri,
            position,
            preselect: entry.isRecommended ? true : undefined,
            label,
            detail,
            filterText: getFilterText(entry.insertText),
            sortText: entry.sortText + index,
            kind: toCompletionItemKind(entry.kind),
            textEdit: range && TextEdit.replace(range, entry.insertText || entry.name),
            insertText: entry.insertText,
            data: {
              // data used for resolving item details (see 'doResolve')
              languageId: js_doc.languageId,
              uri: coffee_doc.uri,
              offset: js_offset,
              source: entry.source,
              tsData: entry.data
            }
          } as CompletionItem;
          // fix: Missing vue extension in filename with import autocomplete
          // https://github.com/vuejs/vetur/issues/2908
          if (item.kind === CompletionItemKind.File && !item.detail?.endsWith('.js') && !item.detail?.endsWith('.ts')) {
            item.insertText = item.detail;
          }
          if (entry.kindModifiers) {
            const kindModifiers = parseKindModifier(entry.kindModifiers ?? '');
            if (kindModifiers.optional) {
              if (!item.insertText) {
                item.insertText = item.label;
              }
              if (!item.filterText) {
                item.filterText = item.label;
              }
              item.label += '?';
            }
            if (kindModifiers.deprecated) {
              item.tags = [CompletionItemTag.Deprecated];
            }
            if (kindModifiers.color) {
              item.kind = CompletionItemKind.Color;
            }
          }

          return item;
        })
      };

      function calculateLabelAndDetailTextForPathImport(entry: ts.CompletionEntry) {
        // Is import path completion
        if (entry.kind === tsModule.ScriptElementKind.scriptElement) {
          if (entry.kindModifiers) {
            return {
              label: entry.name,
              detail: entry.name + entry.kindModifiers
            };
          } else {
            if (entry.name.endsWith(`.${FILE_EXTENSION}`)) {
              return {
                label: entry.name.slice(0, -`.${FILE_EXTENSION}`.length),
                detail: entry.name
              };
            }
          }
        }

        return {
          label: entry.name,
          detail: undefined
        };
      }
    },
    doResolve(doc: TextDocument, item: CompletionItem): CompletionItem {
      const { scriptDoc, service } = updateCurrentCoffeescriptTextDocument(doc);
      if (!languageServiceIncludesFile(service, doc.uri)) {
        return item;
      }
      const fileFsPath = getFileFsPath(doc.uri);

      const transpilation = transpile_service.result_by_uri.get(doc.uri)
      if(!transpilation)
        return item

      const details = service.getCompletionEntryDetails(
        fileFsPath,
        item.data.offset,
        item.label,
        {},
        item.data.source,
        getUserPreferences(scriptDoc),
        item.data.tsData
      );

      if (details && item.kind !== CompletionItemKind.File && item.kind !== CompletionItemKind.Folder) {
        item.detail = Previewer.plain(tsModule.displayPartsToString(details.displayParts));
        const documentation: MarkupContent = {
          kind: 'markdown',
          value: tsModule.displayPartsToString(details.documentation) + '\n\n'
        };

        if (details.tags) {
          if (details.tags) {
            details.tags.forEach(x => {
              const tagDoc = Previewer.getTagDocumentation(x);
              if (tagDoc) {
                documentation.value += tagDoc + '\n\n';
              }
            });
          }
        }

        if (details.codeActions) {
          const textEdits = details.codeActions.map(action =>
            action.changes.map(change =>
              change.textChanges.map(text_change => {
                return {
                  // map_range is possible but does not make sense: ts service response
                  // does not point to a relevant source statement, instead this is the place
                  // where it suggests to insert the import. we can ignore that anyway and place
                  // automatic imports at the very start, always
                  range: Range.create(0, 0, 0, 0),
                  newText: text_change.newText.replace(/;/g,'')
                }
          }))).flat().flat()

          item.additionalTextEdits = textEdits;

          details.codeActions.forEach(action => {
            if (action.description) {
              documentation.value += '\n' + action.description;
            }
          });
        }
        item.documentation = documentation;
        delete item.data;
      }
      return item;
    },
    doHover(doc: TextDocument, position: Position): Hover {
      const { scriptDoc, service } = updateCurrentCoffeescriptTextDocument(doc);
      if (!languageServiceIncludesFile(service, doc.uri)) {
        return { contents: [] };
      }
      const fileFsPath = getFileFsPath(doc.uri);

      const transpilation = transpile_service.result_by_uri.get(doc.uri)
      if(!transpilation)
        return { contents: [] }

      if(transpilation.source_map)
        position = transpile_service.reverse_map_position(transpilation, position) || position

      const info = service.getQuickInfoAtPosition(fileFsPath, scriptDoc.offsetAt(position));

      if (info) {
        const display = tsModule.displayPartsToString(info.displayParts);
        const markedContents: MarkedString[] = [{ language: 'ts', value: display }];

        let hoverMdDoc = '';
        const doc = Previewer.plain(tsModule.displayPartsToString(info.documentation));
        if (doc) {
          hoverMdDoc += doc + '\n\n';
        }

        if (info.tags) {
          info.tags.forEach(x => {
            const tagDoc = Previewer.getTagDocumentation(x);
            if (tagDoc) {
              hoverMdDoc += tagDoc + '\n\n';
            }
          });
        }

        if (hoverMdDoc.trim() !== '') {
          markedContents.push(hoverMdDoc);
        }

        let range = convertRange(scriptDoc, info.textSpan)
        if(transpilation.source_map)
          range = transpile_service.map_range(transpilation.source_map, range)

        return {
          range,
          contents: markedContents
        };
      }
      return { contents: [] };
    },
    doSignatureHelp(doc: TextDocument, position: Position): SignatureHelp | null {
      const { scriptDoc, service } = updateCurrentCoffeescriptTextDocument(doc);
      if (!languageServiceIncludesFile(service, doc.uri)) {
        return NULL_SIGNATURE;
      }
      const fileFsPath = getFileFsPath(doc.uri);

      const transpilation = transpile_service.result_by_uri.get(doc.uri)
      if(!transpilation)
        return NULL_SIGNATURE

      if(transpilation.source_map)
        position = transpile_service.reverse_map_position(transpilation, position) || position

      const signatureHelpItems = service.getSignatureHelpItems(fileFsPath, scriptDoc.offsetAt(position), undefined);
      if (!signatureHelpItems) {
        return NULL_SIGNATURE;
      }

      const signatures: SignatureInformation[] = [];
      signatureHelpItems.items.forEach(item => {
        let sigLabel = '';
        let sigMdDoc = '';
        const sigParamemterInfos: ParameterInformation[] = [];

        sigLabel += tsModule.displayPartsToString(item.prefixDisplayParts);
        item.parameters.forEach((p, i, a) => {
          const label = tsModule.displayPartsToString(p.displayParts);
          const parameter: ParameterInformation = {
            label,
            documentation: tsModule.displayPartsToString(p.documentation)
          };
          sigLabel += label;
          sigParamemterInfos.push(parameter);
          if (i < a.length - 1) {
            sigLabel += tsModule.displayPartsToString(item.separatorDisplayParts);
          }
        });
        sigLabel += tsModule.displayPartsToString(item.suffixDisplayParts);

        item.tags
          .filter(x => x.name !== 'param')
          .forEach(x => {
            const tagDoc = Previewer.getTagDocumentation(x);
            if (tagDoc) {
              sigMdDoc += tagDoc + '\n\n';
            }
          });

        signatures.push({
          label: sigLabel,
          documentation: {
            kind: 'markdown',
            value: sigMdDoc
          },
          parameters: sigParamemterInfos
        });
      });

      return {
        activeSignature: signatureHelpItems.selectedItemIndex,
        activeParameter: signatureHelpItems.argumentIndex,
        signatures
      };
    },
    findDocumentHighlight(doc: TextDocument, position: Position): DocumentHighlight[] {
      const { scriptDoc, service } = updateCurrentCoffeescriptTextDocument(doc);
      if (!languageServiceIncludesFile(service, doc.uri)) {
        return [];
      }
      const fileFsPath = getFileFsPath(doc.uri);

      const transpilation = transpile_service.result_by_uri.get(doc.uri)
      if(!transpilation?.source_map)
        return []

      position = transpile_service.reverse_map_position(transpilation, position) || position

      const occurrences = service.getOccurrencesAtPosition(fileFsPath, scriptDoc.offsetAt(position));
      if (occurrences) {
        return occurrences.map(entry => {
          let range = convertRange(scriptDoc, entry.textSpan)
          if(transpilation.source_map) {
            range = transpile_service.map_range(transpilation.source_map, range)
            range.end.character = range.start.character + entry.textSpan.length
          }
          return {
            range,
            kind: entry.isWriteAccess ? DocumentHighlightKind.Write : DocumentHighlightKind.Text
          };
        });
      }
      return [];
    },
    findDocumentSymbols(doc: TextDocument): SymbolInformation[] {
      const { scriptDoc, service } = updateCurrentCoffeescriptTextDocument(doc);
      if (!languageServiceIncludesFile(service, doc.uri)) {
        return [];
      }
      const fileFsPath = getFileFsPath(doc.uri);

      const transpilation = transpile_service.result_by_uri.get(doc.uri)
      if(!transpilation?.source_map)
        return []

      const items = service.getNavigationBarItems(fileFsPath);
      if (!items) {
        return [];
      }
      const result: SymbolInformation[] = [];
      const existing: { [k: string]: boolean } = {};
      const collectSymbols = (item: ts.NavigationBarItem, containerLabel?: string) => {
        const sig = item.text + item.kind + item.spans[0].start;
        if (item.kind !== 'script' && !existing[sig]) {
          let range = convertRange(scriptDoc, item.spans[0])
          if(transpilation?.source_map)
            range = transpile_service.map_range(transpilation.source_map, range)
          const symbol: SymbolInformation = {
            name: item.text,
            kind: toSymbolKind(item.kind),
            location: {
              uri: doc.uri,
              range
            },
            containerName: containerLabel
          };
          existing[sig] = true;
          result.push(symbol);
          containerLabel = item.text;
        }

        if (item.childItems && item.childItems.length > 0) {
          for (const child of item.childItems) {
            collectSymbols(child, containerLabel);
          }
        }
      };

      items.forEach(item => collectSymbols(item));
      return result;
    },
    findDefinition(doc: TextDocument, position: Position): Definition {
      const { scriptDoc, service } = updateCurrentCoffeescriptTextDocument(doc);
      if (!languageServiceIncludesFile(service, doc.uri)) {
        return [];
      }
      const fileFsPath = getFileFsPath(doc.uri);

      const transpilation = transpile_service.result_by_uri.get(doc.uri)
      if(!transpilation)
        return []

      if(transpilation.source_map)
        position = transpile_service.reverse_map_position(transpilation, position) || position

      const definitions = service.getDefinitionAtPosition(fileFsPath, scriptDoc.offsetAt(position));
      if (!definitions) {
        return [];
      }

      const definitionResults: Definition = [];
      const program = service.getProgram();
      if (!program) {
        return [];
      }
      definitions.forEach(d => {
        const definitionTargetDoc = getSourceDoc(d.fileName, program);
        let range = convertRange(definitionTargetDoc, d.textSpan)
        const uri = URI.file(d.fileName).toString()
        const uri_transpilation = transpile_service.result_by_uri.get(uri)
        if(uri_transpilation?.source_map)
          range = transpile_service.map_range(uri_transpilation.source_map, range)
        definitionResults.push({
          uri,
          range
        });
      });
      return definitionResults;
    },
    findReferences(doc: TextDocument, position: Position): Location[] {
      const { scriptDoc, service } = updateCurrentCoffeescriptTextDocument(doc);
      if (!languageServiceIncludesFile(service, doc.uri)) {
        return [];
      }
      const fileFsPath = getFileFsPath(doc.uri);

      const transpilation = transpile_service.result_by_uri.get(doc.uri)
      if(!transpilation)
        return []

      if(transpilation.source_map)
        position = transpile_service.reverse_map_position(transpilation, position) || position

      const references = service.getReferencesAtPosition(fileFsPath, scriptDoc.offsetAt(position));
      if (!references) {
        return [];
      }

      const referenceResults: Location[] = [];
      const program = service.getProgram();
      if (!program) {
        return [];
      }
      references.forEach(r => {
        const referenceTargetDoc = getSourceDoc(r.fileName, program);

        let range = convertRange(referenceTargetDoc, r.textSpan)
        const uri = URI.file(r.fileName).toString()
        const uri_transpilation = transpile_service.result_by_uri.get(uri)
        if(uri_transpilation?.source_map)
          range = transpile_service.map_range(uri_transpilation.source_map, range)
        if (referenceTargetDoc) {
          referenceResults.push({
            uri,
            range
          });
        }
      });
      return referenceResults;
    },
    getCodeActions(doc: TextDocument, coffee_range: Range, context: CodeActionContext) {
      const transpilation = transpile_service.result_by_uri.get(doc.uri)
      if(!transpilation?.source_map)
        return []
      const js_range = transpile_service.reverse_map_range(transpilation, coffee_range)
      if(!js_range)
        return []

      const { scriptDoc, service } = updateCurrentCoffeescriptTextDocument(doc);
      const fileName = getFileFsPath(scriptDoc.uri);
      const start = scriptDoc.offsetAt(js_range.start);
      const end = scriptDoc.offsetAt(js_range.end);
      const textRange = { pos: start, end };
      const preferences = getUserPreferences(scriptDoc);
      if (!supportedCodeFixCodes) {
        supportedCodeFixCodes = new Set(
          tsModule
            .getSupportedCodeFixes()
            .map(Number)
            .filter(x => !isNaN(x))
        );
      }

      const result: CodeAction[] = [];
      provideOrganizeImports(doc.uri, scriptDoc.languageId as LanguageId, textRange, context, result);

      return result;
    },
    doCodeActionResolve(doc, action) {
      const { scriptDoc, service } = updateCurrentCoffeescriptTextDocument(doc);
      if (!languageServiceIncludesFile(service, doc.uri)) {
        return action;
      }
      const transpilation = transpile_service.result_by_uri.get(doc.uri)
      if(!transpilation?.source_map)
        return action;

      const preferences = getUserPreferences(scriptDoc);

      const fileFsPath = getFileFsPath(doc.uri);
      const data = action.data as CodeActionData;

      if (data.kind === CodeActionDataKind.OrganizeImports) {
        const text_range_length = data.textRange.end - data.textRange.pos
        const mapped_pos_start = transpile_service.reverse_map_position(transpilation, doc.positionAt(data.textRange.pos))
        if(!mapped_pos_start)
          return action
        data.textRange.pos = doc.offsetAt(mapped_pos_start)
        data.textRange.end = data.textRange.pos + text_range_length
        
        const response = service.organizeImports({ type: 'file', fileName: fileFsPath }, {}, preferences);
        action.edit = { changes: createUriMappingForEdits(response.slice(), service) };
        
        const doc_changes = action.edit.changes?.[doc.uri] || []
        for(const change of doc_changes) {
          change.range = transpile_service.map_range(transpilation.source_map, change.range)
          if(change.range.start.line === change.range.end.line && change.range.start.character === 0 && change.range.end.character === 0)
            // Import removed; fix line range
            change.range.end.line++
        }
      }

      delete action.data;
      return action;
    },
    onDocumentRemoved(document: TextDocument) {
      jsDocuments.onDocumentRemoved(document);
    },
    onDocumentChanged(filePath: string) {
      serviceHost.updateExternalDocument(filePath);
    },
    dispose() {
      jsDocuments.dispose();
    }
  };
}

function provideOrganizeImports(
  uri: string,
  languageId: LanguageId,
  textRange: { pos: number; end: number },
  context: CodeActionContext,
  result: CodeAction[]
) {
  if (
    !context.only ||
    (!context.only.includes(CodeActionKind.SourceOrganizeImports) && !context.only.includes(CodeActionKind.Source))
  ) {
    return;
  }

  result.push({
    title: 'Organize Imports',
    kind: CodeActionKind.SourceOrganizeImports,
    data: {
      uri,
      languageId,
      textRange,
      kind: CodeActionDataKind.OrganizeImports
    } as OrganizeImportsActionData
  });
}

function createUriMappingForEdits(changes: ts.FileTextChanges[], service: ts.LanguageService) {
  const program = service.getProgram()!;
  const result: Record<string, TextEdit[]> = {};
  for (const { fileName, textChanges } of changes) {
    const targetDoc = getSourceDoc(fileName, program);
    const edits = textChanges.map(({ newText, span }) => ({
      newText,
      range: convertRange(targetDoc, span)
    }));
    const uri = URI.file(fileName).toString();
    if (result[uri]) {
      result[uri].push(...edits);
    } else {
      result[uri] = edits;
    }
  }
  return result;
}

function getSourceDoc(fileName: string, program: ts.Program): TextDocument {
  const sourceFile = program.getSourceFile(fileName)!;
  return TextDocument.create(fileName, LANGUAGE_ID, 0, sourceFile.getFullText());
}

export function languageServiceIncludesFile(ls: ts.LanguageService, documentUri: string): boolean {
  const filePaths = ls.getProgram()!.getRootFileNames();
  const filePath = getFilePath(documentUri);
  return filePaths.includes(filePath);
}

function convertRange(document: TextDocument, span: ts.TextSpan): Range {
  const startPosition = document.positionAt(span.start);
  const endPosition = document.positionAt(span.start + span.length);
  return Range.create(startPosition, endPosition);
}

// Parameter must to be string, Otherwise I don't like it semantically.
function getTsTriggerCharacter(triggerChar: string) {
  const legalChars = ['@', '#', '.', '"', "'", '`', '/', '<', ' '];
  if (legalChars.includes(triggerChar)) {
    return triggerChar as ts.CompletionsTriggerCharacter;
  }
  return undefined;
}

function parseKindModifier(kindModifiers: string) {
  const kinds = new Set(kindModifiers.split(/,|\s+/g));

  return {
    optional: kinds.has('optional'),
    deprecated: kinds.has('deprecated'),
    color: kinds.has('color')
  };
}

function convertTSDiagnosticCategoryToDiagnosticSeverity(
  tsModule: RuntimeLibrary['typescript'],
  c: ts.DiagnosticCategory
) {
  switch (c) {
    case tsModule.DiagnosticCategory.Error:
      return DiagnosticSeverity.Error;
    case tsModule.DiagnosticCategory.Warning:
      return DiagnosticSeverity.Warning;
    case tsModule.DiagnosticCategory.Message:
      return DiagnosticSeverity.Information;
    case tsModule.DiagnosticCategory.Suggestion:
      return DiagnosticSeverity.Hint;
    default:
      return DiagnosticSeverity.Error;
  }
}

/* tslint:disable:max-line-length */
/**
 * Adapted from https://github.com/microsoft/vscode/blob/2b090abd0fdab7b21a3eb74be13993ad61897f84/extensions/typescript-language-features/src/languageFeatures/completions.ts#L147-L181
 */
function getFilterText(insertText: string | undefined): string | undefined {
  // For `this.` completions, generally don't set the filter text since we don't want them to be overly prioritized. #74164
  if (insertText?.startsWith('this.')) {
    return undefined;
  }

  // Handle the case:
  // ```
  // const xyz = { 'ab c': 1 };
  // xyz.ab|
  // ```
  // In which case we want to insert a bracket accessor but should use `.abc` as the filter text instead of
  // the bracketed insert text.
  else if (insertText?.startsWith('[')) {
    return insertText.replace(/^\[['"](.+)[['"]\]$/, '.$1');
  }

  // In all other cases, fallback to using the insertText
  return insertText;
}
