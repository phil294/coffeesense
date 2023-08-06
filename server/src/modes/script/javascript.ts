import type ts from 'typescript';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  CodeAction, CodeActionContext, CodeActionKind, CompletionItem, CompletionItemKind, CompletionItemTag, CompletionList, Definition, Diagnostic,
  DiagnosticSeverity, DiagnosticTag, DocumentHighlight,
  DocumentHighlightKind, Hover, Location, MarkedString, MarkupContent, ParameterInformation, Position, Range, SignatureHelp,
  SignatureInformation, TextEdit
} from 'vscode-languageserver-types';
import { URI } from 'vscode-uri';
import { CoffeescriptDocumentRegions, LanguageId } from '../../embeddedSupport/embeddedSupport';
import { getLanguageModelCache, LanguageModelCache } from '../../embeddedSupport/languageModelCache';
import { LanguageMode } from '../../embeddedSupport/languageModes';
import { LANGUAGE_ID } from '../../language';
import { DependencyService, RuntimeLibrary } from '../../services/dependencyService';
import { DocumentService } from '../../services/documentService';
import { EnvironmentService } from '../../services/EnvironmentService';
import transpile_service, { common_js_variable_name_character, get_line_at_line_no, get_word_around_position, pseudo_compile_coffee } from '../../services/transpileService';
import { IServiceHost } from '../../services/typescriptService/serviceHost';
import { toCompletionItemKind } from '../../services/typescriptService/util';
import { CodeActionData, CodeActionDataKind, OrganizeImportsActionData } from '../../types';
import { isVCancellationRequested, VCancellationToken } from '../../utils/cancellationToken';
import { getFileFsPath, getFilePath } from '../../utils/paths';
import { NULL_SIGNATURE } from '../nullMode';
import * as Previewer from './previewer';
import { HighlightSpanKind } from 'typescript';



export async function getJavascriptMode(
  tsModule: RuntimeLibrary['typescript'],
  serviceHost: IServiceHost,
  env: EnvironmentService,
  documentRegions: LanguageModelCache<CoffeescriptDocumentRegions>,
  dependencyService: DependencyService,
  documentService: DocumentService
): Promise<LanguageMode> {
  const jsDocuments = getLanguageModelCache(10, 60, document => {
    const coffeescriptDocument = documentRegions.refreshAndGet(document);
    return coffeescriptDocument.getSingleTypeDocument('script');
  });

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
      allowRenameOfImportPath: true,
      includeAutomaticOptionalChainCompletions: baseConfig.suggest.includeAutomaticOptionalChainCompletions ?? true,
      provideRefactorNotApplicableReason: true
    };
  }

  return {
    getId() {
      return 'javascript';
    },
    async doValidation(coffee_doc: TextDocument, cancellationToken?: VCancellationToken): Promise<Diagnostic[]> {
      if (await isVCancellationRequested(cancellationToken)) {
        return [];
      }
      const { scriptDoc: js_doc, service } = updateCurrentCoffeescriptTextDocument(coffee_doc);
      if (!languageServiceIncludesFile(service, coffee_doc.uri)) {
        return [];
      }

      if (await isVCancellationRequested(cancellationToken)) {
        return [];
      }

      const transpilation = transpile_service.result_by_uri.get(coffee_doc.uri)
      if(!transpilation)
        return []
      if(transpilation.diagnostics)
        return transpilation.diagnostics || []

      const fileFsPath = getFileFsPath(coffee_doc.uri);
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

      const js_text = js_doc.getText()

      return rawScriptDiagnostics
      .filter(diag => !env.getConfig().coffeesense.ignoredTypescriptErrorCodes.includes(diag.code))
      .filter(diag => diag.messageText !== "Parameter '_' implicitly has an 'any' type." &&
        diag.messageText !== "'_' is declared but its value is never read.")
      .map(diag => {
        const tags: DiagnosticTag[] = [];
        let message = tsModule.flattenDiagnosticMessageText(diag.messageText, '\n')

        if (diag.reportsUnnecessary) {
          tags.push(DiagnosticTag.Unnecessary);
        }
        if (diag.reportsDeprecated) {
          tags.push(DiagnosticTag.Deprecated);
        }

        let range = convertRange(js_doc, diag as ts.TextSpan)

        if(get_line_at_line_no(js_doc, range.start.line).match(/^\s*var /)) {
            // Position of errors shown at variable declaration are most often useless, it would
            // be better to show them at their (first) usage instead which implies declaration
            // in CS. Luckily, this is possible using highlight querying:
            const occurrence = service.getDocumentHighlights(fileFsPath, js_doc.offsetAt(range.start), [fileFsPath])?.[0]?.highlightSpans[1]
            if(occurrence)
              range = convertRange(js_doc, occurrence. textSpan)
        }

        if(transpilation.source_map) {
          const coffee_range = transpile_service.range_js_to_coffee(transpilation, range, coffee_doc)
          if(coffee_range) {
            range = coffee_range
          } else {
            message += `\n\nThe position of this error could not be mapped back to CoffeeScript, sorry. Here's the failing JavaScript context:\n\n${js_text.slice(
                js_doc.offsetAt({ line: range.start.line - 2, character: 0}),
                js_doc.offsetAt({ line: range.start.line + 2, character: Number.MAX_VALUE}))}`
            range = Range.create(0, 0, 0, 0)
          }
          if(range.end.line < range.start.line || range.end.line === range.start.line && range.end.character < range.start.character)
            // end character is messed up (happens often). just use whole word instead
            // Setting char end to start or to start+1 only highlights the first character.
            // No idea how to properly highlight the full next word? Doing it the manual way:
            range.end = { line: range.start.line, character: range.start.character + 1 }
            while(coffee_doc.getText(Range.create(range.end, { line: range.end.line, character: range.end.character + 1}))
                .match(common_js_variable_name_character)) {
              range.end.character++;
            }
        }

        // syntactic/semantic diagnostic always has start and length
        // so we can safely cast diag to TextSpan
        return <Diagnostic>{
          range,
          severity: convertTSDiagnosticCategoryToDiagnosticSeverity(tsModule, diag.category),
          message,
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
      
      const coffee_text = coffee_doc.getText()
      const coffee_offset = coffee_doc.offsetAt(coffee_position)
      const coffee_next_char = coffee_text[coffee_offset]
      const coffee_last_char = coffee_text[coffee_offset - 1]
      const coffee_second_last_char = coffee_text[coffee_offset - 2]
      const { word: coffee_word } = get_word_around_position(coffee_text, coffee_offset)
      const coffee_line = get_line_at_line_no(coffee_doc, coffee_position.line)
      let position: Position
      if(transpilation.source_map) {
        // For position reverse mapping, remove . char, and add again to result afterwards.
        // Otherwise, the source map does not know what you're talking of
        let dot_offset_tweak = 0
        if(coffee_last_char === '.') {
          dot_offset_tweak = -1
          if(coffee_second_last_char === '?')
            dot_offset_tweak = -2
        }
        const coffee_position_tweaked = {
          line: coffee_position.line,
          character: coffee_position.character + dot_offset_tweak
        }
        if(coffee_line.startsWith("import {") && [' ', '}'].includes(coffee_next_char||'')) {
          let i = coffee_offset - 1
          while(['\t', ' '].includes(coffee_text[i]||''))
            i--
          if(['{', ','].includes(coffee_text[i]||''))
            // Last char was a comma.
            // CS compiler strips trailing commas in imports and also does not have super accurate
            // source maps in between import modules names, so when adding a new module, move cursor
            // to start of first existing import which gives correct results:
            coffee_position_tweaked.character = 9
        } else if(coffee_next_char === '}' && coffee_last_char === ' ' && coffee_second_last_char === ',') {
          coffee_position_tweaked.character--
        }
        let js_position = transpile_service.position_coffee_to_js(transpilation, coffee_position_tweaked, coffee_doc)
        if(!js_position) {
          // The following works great in principle, but is not useful as cs indentation is wrong,
          // comma is missing, scope is mostly simply wrong
          /*
          // Fallback: Current line in coffee does not exist in JS, e.g. empty line, perhaps
          // indented. In this case, find the next previous mapping-existing line and move cursor forward
          // one character/line.
          const i_coffee_pos = { character: 0, line: coffee_position_excl_trigger_char.line }
          while(--i_coffee_pos.line > 0) {
            js_position = transpile_service.position_coffee_to_js(transpilation, i_coffee_pos, coffee_doc)
            if(js_position)
              break
          }
          if(js_position) {
            js_position.line++
            js_position.character = 0
          }
          */
        }
        if(!js_position)
          return { isIncomplete: false, items: [] }
        position = {
          line: js_position.line,
          character: js_position.character - dot_offset_tweak
        }
      } else {
        // If no source map, the file is passed as coffee text which must not be mapped
        position = coffee_position
      }

      const js_text = js_doc.getText()

      const js_line = get_line_at_line_no(js_doc, position.line)
      if(js_line.startsWith("import {} from ") && (position.character === 7 || position.character === 9)) {
        // special case. There are no source maps pointing into {|}, so move it there
        position.character = 8
      }

      let js_offset = js_doc.offsetAt(position);

      let char_offset = 0
      const js_last_char = js_text[js_offset - 1]
      const js_second_last_char = js_text[js_offset - 2]
      const js_next_char = js_text[js_offset]
      if(js_second_last_char === ':' && js_last_char === ' ' && js_next_char?.match(common_js_variable_name_character)) {
        // source maps are wrong, cursor is in CS before : but in JS after :, fix this:
        char_offset = -2
      } else if(js_next_char === '{') {
        // pretty much always want to know what's *inside* the object, when sourcemap points directly before
        char_offset++
      } else {
        const special_trigger_chars = ['"', "'"]
        for(const s of special_trigger_chars) {
          // When CS cursor is e.g. at `a('|')`, completion does not work bc of bad source mapping,
          // JS cursor is falsely `a(|'')`. Circumvent this:
          if((coffee_last_char === s || [s, '\n', undefined].includes(coffee_next_char)) && js_last_char !== s && !js_last_char?.match(common_js_variable_name_character) && js_next_char === s) {
            char_offset = 1
            break
          // When adding closing brace using aggressive preprocessing, e.g. `("ab|`, JS is falsely
          // at `("ab"|);`:
          } else if(coffee_line.includes(s) && js_last_char === s && js_next_char === ')') {
            char_offset = -1
            break
          }
        }
      }
      js_offset += char_offset

      if(char_offset === 0) {
        if(coffee_last_char === '@') {
          if (js_text.substr(js_offset - 5, 26) === '(this.valueOf(),this)     ')
            js_offset++
          else if(js_text.substr(js_offset - 26, 26) === '(this.valueOf(),this)     ')
            js_offset -= 20
        }
      }

      const completion_options = {
        ...getUserPreferences(js_doc),
        triggerCharacter: getTsTriggerCharacter(coffee_last_char || ''),
        includeCompletionsWithInsertText: true,
        includeCompletionsForModuleExports: true
      }
      let completions = service.getCompletionsAtPosition(fileFsPath, js_offset, completion_options);
      
      if(! js_line.startsWith('import') && ! js_line.includes('require(') && coffee_last_char !== '{' && coffee_second_last_char !== '{') {
        let outside_brace_check_offset = 0
        if(js_next_char === '{')
          // offset is ++, so we're actually *after* the { now
          outside_brace_check_offset = -1
        else if(js_next_char === '}')
          outside_brace_check_offset = 1
        if(outside_brace_check_offset) {
          // It must also be possible to insert normal variable references here - at this point, it is
          // impossible to predict whether the user wants to define a new object here or insert a var.
          // Get suggestions for both by moving the cursor outside the object:
          const completions_outside_object = service.getCompletionsAtPosition(fileFsPath, js_offset + outside_brace_check_offset, completion_options);
          if(completions_outside_object) {
            if(completions) {
              completions.entries.forEach(e => e.sortText = '0') // prefer inside to outside
              completions.entries.push(...completions_outside_object.entries)
            } else {
              completions = completions_outside_object
            }
          }
        }
      }

      if (!completions) {
        return { isIncomplete: false, items: [] };
      }
      let completion_entries = completions.entries
      if(coffee_last_char?.match(common_js_variable_name_character)) {
        completion_entries = completion_entries.filter(e => e.name.includes(coffee_word))
      }
      return {
        isIncomplete: false,
        items: completion_entries.map((entry, index) => {
          let range = entry.replacementSpan && convertRange(js_doc, entry.replacementSpan);
          if(range) {
            // This is a rare occurrence: Normally, replacements are only specified as insertText or label.
            // With replacementSpan, more complicated insertions are bound to happen: Insertions outside of
            // cursor position (e.g. `].|` becoming `]?.completionText`.
            if(transpilation.source_map)
              range = transpile_service.range_js_to_coffee(transpilation, range, coffee_doc)  || range
            range.start.character += char_offset
            range.end.character += char_offset
            // VSCode fails to show this completion item when the cursor is not inside that very range and is arguably
            // right to do so as that is probably always an error. So check for containment and move
            // to cursor otherwise.
            if(coffee_position.line !== range.end.line || coffee_position.line !== range.start.line || coffee_position.character < range.start.character || coffee_position.character > range.end.character) {
              range = Range.create(Position.create(coffee_position.line, coffee_position.character), Position.create(coffee_position.line, coffee_position.character))
              if(coffee_last_char === '.' && (entry.insertText?.startsWith('?.') || entry.insertText?.startsWith('['))) {
                // Special case
                range.start.character--
              } else {
                // Not perfect but good enough for most cases, e.g. open-string-as-function-param-brace-indented.coffee
                range.start.character -= entry.replacementSpan?.length || 0
              }
            }
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
            insertText: entry.insertText?.replace(/^this\./, ''),
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
          }
        }

        return {
          label: entry.name,
          detail: undefined
        };
      }
    },
    doResolve(coffee_doc: TextDocument, item: CompletionItem): CompletionItem {
      const { scriptDoc: js_doc, service } = updateCurrentCoffeescriptTextDocument(coffee_doc);
      if (!languageServiceIncludesFile(service, coffee_doc.uri)) {
        return item;
      }
      const fileFsPath = getFileFsPath(coffee_doc.uri);

      const transpilation = transpile_service.result_by_uri.get(coffee_doc.uri)
      if(!transpilation)
        return item

      const details = service.getCompletionEntryDetails(
        fileFsPath,
        item.data.offset,
        item.label,
        {},
        item.data.source,
        getUserPreferences(js_doc),
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
          // auto imports
          const coffee_lines = coffee_doc.getText().split('\n')
          const textEdits = details.codeActions.map(action =>
            action.changes.map(change =>
              change.textChanges.map(text_change => {
                const js_range = convertRange(js_doc, text_change.span)
                let range: Range | undefined
                if(transpilation.source_map) {
                  range = js_range
                  let coffee_range = transpile_service.range_js_to_coffee(transpilation, js_range, coffee_doc)
                  if(coffee_range) {
                    const coffee_line = coffee_lines[coffee_range.start.line]!
                    let coffee_range_end_of_named_group
                    let coffee_end_of_named_group_col = coffee_line.indexOf('}')
                    if(coffee_end_of_named_group_col > -1) {
                      if(coffee_line[coffee_end_of_named_group_col - 1] === ' ')
                        coffee_end_of_named_group_col--
                      const coffee_pos = { line: coffee_range.start.line, character: coffee_end_of_named_group_col }
                      coffee_range_end_of_named_group = Range.create(coffee_pos, coffee_pos)
                    }
                    if(text_change.newText.startsWith(', { ')) {
                      // Add new named imports group to existing default import
                      const coffee_from_col = coffee_line.indexOf(' from ')
                      if(coffee_from_col > -1) {
                        const coffee_pos = { line: coffee_range.start.line, character: coffee_from_col }
                        coffee_range = Range.create(coffee_pos, coffee_pos)
                      }
                    } else if(text_change.newText.startsWith(', ')) {
                      // Add named import to existing named imports group
                      coffee_range = coffee_range_end_of_named_group
                    } else if(text_change.newText[0] === '\n') {                      
                      // Add named import to existing named imports group in new line
                      // We don't want new line and add a missing comma
                        text_change.newText = text_change.newText.replace(/^\s+(.+)$/, (_, named_import) =>
                          ', ' + named_import)
                        coffee_range = coffee_range_end_of_named_group
                    } else if(text_change.newText === ',') {
                      // named import to existing named imports group actions consist of two text changes,
                      // the first one being a comma, ignore it
                      text_change.newText = ''
                    } else if(text_change.newText.trim().endsWith(',')) {
                      // Add named import to existing named imports group, possibly new line,
                      // in between two other named imports
                      // We don't insert in between but only at the end of group instead
                      text_change.newText = ', ' + text_change.newText.trim().slice(0, -1)
                      coffee_range = coffee_range_end_of_named_group
                    } else {
                      // Add entirely new import. Line should start with 'import',
                      // but it can also be CommonJS-style, I haven't checked this further
                      const coffee_pos = { line: 0, character: 0 }
                      coffee_range = Range.create(coffee_pos, coffee_pos)
                    }
                  }
                  range = coffee_range
                }
                if(!range) {
                  if(text_change. newText.startsWith('import')) {
                    range = Range.create(0, 0, 0, 0)
                  } else {
                    const js_line = get_line_at_line_no(js_doc, js_range.start.line).trim()
                    const equiv_coffee_line_no = coffee_lines.findIndex(coffee_line => pseudo_compile_coffee(coffee_line) === js_line)
                    if(js_line.startsWith('import ') && equiv_coffee_line_no > -1)
                      // Fallback import matching, mostly when cs compilation failed and the import comes from ts by parsing cs directly with no source maps available
                      range = Range.create(equiv_coffee_line_no, js_range.start.character, equiv_coffee_line_no, js_range.end.character)
                    else
                      // Failed! Do not add import, it would only be messy.
                      return {}
                  }
                }
                return {
                  range,
                  newText: text_change.newText.replace(/;/g,'')
                }
          }).filter((c): c is TextEdit => !! c.newText)
          )).flat().flat()

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
    doHover(coffee_doc: TextDocument, position: Position): Hover {
      const { scriptDoc: js_doc, service } = updateCurrentCoffeescriptTextDocument(coffee_doc);
      if (!languageServiceIncludesFile(service, coffee_doc.uri)) {
        return { contents: [] };
      }
      const fileFsPath = getFileFsPath(coffee_doc.uri);

      const transpilation = transpile_service.result_by_uri.get(coffee_doc.uri)
      if(!transpilation)
        return { contents: [] }

      if(transpilation.source_map)
        position = transpile_service.position_coffee_to_js(transpilation, position, coffee_doc) || position

      const info = service.getQuickInfoAtPosition(fileFsPath, js_doc.offsetAt(position));

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

        let range = convertRange(js_doc, info.textSpan)
        if(transpilation.source_map)
          range = transpile_service.range_js_to_coffee(transpilation, range, coffee_doc) || range

        return {
          range,
          contents: markedContents
        };
      }
      return { contents: [] };
    },
    doSignatureHelp(coffee_doc: TextDocument, position: Position): SignatureHelp | null {
      const { scriptDoc: js_doc, service } = updateCurrentCoffeescriptTextDocument(coffee_doc);
      if (!languageServiceIncludesFile(service, coffee_doc.uri)) {
        return NULL_SIGNATURE;
      }
      const fileFsPath = getFileFsPath(coffee_doc.uri);

      const transpilation = transpile_service.result_by_uri.get(coffee_doc.uri)
      if(!transpilation)
        return NULL_SIGNATURE

      if(transpilation.source_map)
        position = transpile_service.position_coffee_to_js(transpilation, position, coffee_doc) || position

      const signatureHelpItems = service.getSignatureHelpItems(fileFsPath, js_doc.offsetAt(position), undefined);
      if (!signatureHelpItems) {
        return NULL_SIGNATURE;
      }

      const signatures: SignatureInformation[] = [];
      signatureHelpItems.items.forEach(item => {
        let sigLabel = '';
        let sigMdDoc = '';
        const sigParameterInfos: ParameterInformation[] = [];

        sigLabel += tsModule.displayPartsToString(item.prefixDisplayParts);
        item.parameters.forEach((p, i, a) => {
          const label = tsModule.displayPartsToString(p.displayParts);
          const parameter: ParameterInformation = {
            label,
            documentation: tsModule.displayPartsToString(p.documentation)
          };
          sigLabel += label;
          sigParameterInfos.push(parameter);
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
          parameters: sigParameterInfos
        });
      });

      return {
        activeSignature: signatureHelpItems.selectedItemIndex,
        activeParameter: signatureHelpItems.argumentIndex,
        signatures
      };
    },
    findDocumentHighlight(coffee_doc: TextDocument, position: Position): DocumentHighlight[] {
      const { scriptDoc: js_doc, service } = updateCurrentCoffeescriptTextDocument(coffee_doc);
      if (!languageServiceIncludesFile(service, coffee_doc.uri)) {
        return [];
      }
      const fileFsPath = getFileFsPath(coffee_doc.uri);

      const transpilation = transpile_service.result_by_uri.get(coffee_doc.uri)
      if(!transpilation?.source_map)
        return []

      position = transpile_service.position_coffee_to_js(transpilation, position, coffee_doc) || position

      const occurrences = service.getDocumentHighlights(fileFsPath, js_doc.offsetAt(position), [fileFsPath])?.[0]?.highlightSpans;
      if (occurrences) {
        return occurrences
          .map(entry => ({
            entry,
            range: convertRange(js_doc, entry.textSpan)
          })).filter(({ range }) =>
            ! get_line_at_line_no(js_doc, range.start.line).match(/^\s*var /)
          ).map(({ entry, range }) => {
            if(transpilation.source_map) {
              range = transpile_service.range_js_to_coffee(transpilation, range, coffee_doc) || range
              if(range.end.line < range.start.line)
                range.end.line = range.start.line
              range.end.character = range.start.character + entry.textSpan.length
            }
            return {
              range,
              kind: entry.kind === HighlightSpanKind.writtenReference ?DocumentHighlightKind.Write : DocumentHighlightKind.Text
            };
          });
      }
      return [];
    },
    findDefinition(coffee_doc: TextDocument, coffee_position: Position): Definition {
      const { scriptDoc: js_doc, service } = updateCurrentCoffeescriptTextDocument(coffee_doc);
      if (!languageServiceIncludesFile(service, coffee_doc.uri)) {
        return [];
      }
      const fileFsPath = getFileFsPath(coffee_doc.uri);

      const transpilation = transpile_service.result_by_uri.get(coffee_doc.uri)
      if(!transpilation)
        return []
    
      let position = coffee_position
      if(transpilation.source_map) {
        const js_position = transpile_service.position_coffee_to_js(transpilation, coffee_position, coffee_doc)
        if(js_position)
          position = js_position
      }

      const definitions = service.getDefinitionAtPosition(fileFsPath, js_doc.offsetAt(position));
      if (!definitions?.length) {
        // Basic word match algorithm: Jump to the first previous occurence of varname = ..., if present.
        const { word: word_at_coffee_position } = get_word_around_position(coffee_doc.getText(), coffee_doc.offsetAt(coffee_position))
        if(!word_at_coffee_position)
          return []
        const coffee_lines = coffee_doc.getText().split('\n')
        let i = coffee_position.line
        let var_assignment_match = null
        while(coffee_lines[i-1]) {
          i--
          var_assignment_match = coffee_lines[i]?.match(new RegExp(`^(\\s*)(${word_at_coffee_position})\\s*=[^=]`))
          if(var_assignment_match)
            break
        }
        if(var_assignment_match) {
          return [{
            uri: coffee_doc.uri,
            range: Range.create(i, var_assignment_match[1]!.length, i, var_assignment_match[1]!.length + var_assignment_match[2]!.length)
          }]
        }
        return []
      }

      const definitionResults: Definition = [];
      const program = service.getProgram();
      if (!program) {
        return [];
      }
      definitions.forEach(d => {
        const definitionTargetDoc_js = getSourceDoc(d.fileName, program);
        let range = convertRange(definitionTargetDoc_js, d.textSpan)
        const uri = URI.file(d.fileName).toString()
        // TODO: Can be empty if file has not been opened yet. This breaks the definition positioning :(
        // It would be necessary to somehow load that file now (if undefined *and* if coffee file)
        const definitionTargetDoc_coffee = documentService.getDocument(uri)
        const uri_transpilation = transpile_service.result_by_uri.get(uri)
        if(uri_transpilation?.source_map)
          range = transpile_service.range_js_to_coffee(uri_transpilation, range, definitionTargetDoc_coffee || coffee_doc) || range
        definitionResults.push({
          uri,
          range
        });
      });
      return definitionResults;
    },
    findReferences(coffee_doc: TextDocument, position: Position): Location[] {
      const { scriptDoc: js_doc, service } = updateCurrentCoffeescriptTextDocument(coffee_doc);
      if (!languageServiceIncludesFile(service, coffee_doc.uri)) {
        return [];
      }
      const fileFsPath = getFileFsPath(coffee_doc.uri);

      const transpilation = transpile_service.result_by_uri.get(coffee_doc.uri)
      if(!transpilation)
        return []

      if(transpilation.source_map)
        position = transpile_service.position_coffee_to_js(transpilation, position, coffee_doc) || position

      const references = service.getReferencesAtPosition(fileFsPath, js_doc.offsetAt(position));
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
        const referenceTargetDoc_coffee = documentService.getDocument(uri)
        const uri_transpilation = transpile_service.result_by_uri.get(uri)
        if(uri_transpilation?.source_map)
          range = transpile_service.range_js_to_coffee(uri_transpilation, range, referenceTargetDoc_coffee || coffee_doc) || range
        if (referenceTargetDoc) {
          referenceResults.push({
            uri,
            range
          });
        }
      });
      return referenceResults;
    },
    getCodeActions(coffee_doc: TextDocument, coffee_range: Range, context: CodeActionContext) {
      const transpilation = transpile_service.result_by_uri.get(coffee_doc.uri)
      if(!transpilation?.source_map)
        return []
      const js_range = transpile_service.range_coffee_to_js(transpilation, coffee_range, coffee_doc)
      if(!js_range)
        return []

      const { scriptDoc: js_doc, service } = updateCurrentCoffeescriptTextDocument(coffee_doc);
      const fileName = getFileFsPath(js_doc.uri);
      const start = js_doc.offsetAt(js_range.start);
      const end = js_doc.offsetAt(js_range.end);
      const textRange = { pos: start, end };
      const preferences = getUserPreferences(js_doc);
      if (!supportedCodeFixCodes) {
        supportedCodeFixCodes = new Set(
          tsModule
            .getSupportedCodeFixes()
            .map(Number)
            .filter(x => !isNaN(x))
        );
      }

      const result: CodeAction[] = [];
      provideOrganizeImports(coffee_doc.uri, js_doc.languageId as LanguageId, textRange, context, result);

      return result;
    },
    doCodeActionResolve(coffee_doc, action) {
      const { scriptDoc: js_doc, service } = updateCurrentCoffeescriptTextDocument(coffee_doc);
      if (!languageServiceIncludesFile(service, coffee_doc.uri)) {
        return action;
      }
      const transpilation = transpile_service.result_by_uri.get(coffee_doc.uri)
      if(!transpilation?.source_map)
        return action;

      const preferences = getUserPreferences(js_doc);

      const fileFsPath = getFileFsPath(coffee_doc.uri);
      const data = action.data as CodeActionData;

      if (data.kind === CodeActionDataKind.OrganizeImports) {
        const text_range_length = data.textRange.end - data.textRange.pos
        const mapped_pos_start = transpile_service.position_coffee_to_js(transpilation, coffee_doc.positionAt(data.textRange.pos), coffee_doc)
        if(!mapped_pos_start)
          return action
        data.textRange.pos = coffee_doc.offsetAt(mapped_pos_start)
        data.textRange.end = data.textRange.pos + text_range_length
        
        const response = service.organizeImports({ type: 'file', fileName: fileFsPath }, {}, preferences);
        const edit = { changes: createUriMappingForEdits(response.slice(), service) };
        
        const doc_changes = edit.changes?.[coffee_doc.uri] || []
        for(const change of doc_changes) {
          const range = transpile_service.range_js_to_coffee(transpilation, change.range, coffee_doc)
          if(!range)
            return action
          if(change.range.start.line === change.range.end.line && change.range.start.character === 0 && change.range.end.character === 0)
            // Import removed; fix line range
            change.range.end.line++
        }
        
        action.edit = edit
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
      result[uri]!.push(...edits);
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
  const startPosition = document.positionAt(span.start || 0);
  const endPosition = document.positionAt((span.start + span.length) || 0);
  return Range.create(startPosition, endPosition);
}

// Parameter must to be string, Otherwise I don't like it semantically.
function getTsTriggerCharacter(triggerChar: string) {
  // Sometimes autocomplete does not work with spaces indented inside objects (empty line).
  // Not sure why, but TS rejects space as a valid trigger character in these scenarios.
  // This function does not make any sense anymore anyway in CoffeeScript land: Most of
  // these tokens have a completely different meaning than in JS.
  // Setting to `.` allows for completion, no matter what. (typescript.js: `isValidTrigger`)
  return '.';
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