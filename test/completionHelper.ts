import vscode, { CompletionItemKind } from 'vscode';
import assert from 'assert';
import { CompletionItem, MarkdownString } from 'vscode';
import { showFile } from './editorHelper';

export interface ExpectedCompletionItem extends CompletionItem {
  /**
   * Documentation has to start with this string
   */
  documentationStart?: string;
  /**
   * Documentation has to include this string
   */
  documentationFragment?: string;
  /**
   * Insertion text edit's string
   */
  insertTextValue?: string;
}

export async function testCompletion({ doc_uri, position, expected_items: expectedItems, match_fn: matchFn, allow_globals, unexpected_items, allow_unspecified }: {
  doc_uri: vscode.Uri,
  position: vscode.Position,
  expected_items: (string | ExpectedCompletionItem)[],
  unexpected_items?: string[],
  allow_unspecified?: boolean,
  allow_globals?: boolean,
  match_fn?: (ei: string | ExpectedCompletionItem) => (result: CompletionItem) => boolean,
}) {
  await showFile(doc_uri);

  const result = (await vscode.commands.executeCommand(
    'vscode.executeCompletionItemProvider',
    doc_uri,
    position
  )) as vscode.CompletionList;

  // todo allow_unspecified is not in use??
  if(!allow_unspecified && !allow_globals)
    //@ts-ignore
    assert.equal(expectedItems.length, result.items.filter(i => i.label.label !== '#region' && i.label.label !== '#endregion' && i.label !== '#region' && i.label !== '#endregion').length)

  if(!allow_globals) {
    // We never want to see global suggestions, like DOM:
    // This is because 1. it can yield false positives from import suggestions
    // for fields that should have been suggested from other sources instead, and
    // 2. it almost always means that some scoping is wrong.
    assert.ok(! result.items.some(i => i.label === 'AbortController' || i.label === 'encodeURIComponent'))
    // With lodash, there can be as many as 396 (2022-03)
    assert.ok(result.items.length < 450)
  }

  if(unexpected_items?.length)
    // @ts-ignore
    assert.ok(! result.items.some(i => unexpected_items.includes(i.label.label? i.label.label : i.label)))

  expectedItems.forEach(ei => {
    let match_index = -1
    if (typeof ei === 'string') {
      match_index = result.items.findIndex(i => {
          return i.label === ei &&
            // Omit standard matches like variable as these primarily yield false positives.
            // If these are really required, they can be passed separately.
            [CompletionItemKind.Function, CompletionItemKind.Property, CompletionItemKind.Field].includes(i.kind || -1)
        })
      assert.ok(match_index > -1,
        `Can't find matching item for\n${JSON.stringify(ei, null, 2)}\nSeen items:\n${JSON.stringify(
          result.items,
          null,
          2
        )}`
      );
    } else {
      const match_index = matchFn ? result.items.findIndex(matchFn(ei)) : result.items.findIndex(i => i.label === ei.label);
      const match = result.items[match_index]
      if (!match) {
        assert.fail(
          `Can't find matching item for\n${JSON.stringify(ei, null, 2)}\nSeen items:\n${JSON.stringify(
            result.items,
            null,
            2
          )}`
        );
      }

      assert.equal(match.label, ei.label);
      if (ei.kind) {
        assert.equal(match.kind, ei.kind);
      }
      if (ei.detail) {
        assert.equal(match.detail, ei.detail);
      }

      if (ei.documentation) {
        if (typeof match.documentation === 'string') {
          assert.equal(normalizeNewline(match.documentation), normalizeNewline(ei.documentation as string));
        } else {
          if (ei.documentation && (ei.documentation as MarkdownString).value && match.documentation) {
            assert.equal(
              normalizeNewline((match.documentation as vscode.MarkdownString).value),
              normalizeNewline((ei.documentation as MarkdownString).value)
            );
          }
        }
      }

      if (ei.documentationStart) {
        if (typeof match.documentation === 'string') {
          assert.ok(
            match.documentation.startsWith(ei.documentationStart),
            `${match.documentation}\ndoes not start with\n${ei.documentationStart}`
          );
        } else {
          assert.ok(
            (match.documentation as vscode.MarkdownString).value.startsWith(ei.documentationStart),
            `${(match.documentation as vscode.MarkdownString).value}\ndoes not start with\n${ei.documentationStart}`
          );
        }
      }

      if (ei.documentationFragment) {
        if (typeof match.documentation === 'string') {
          assert.ok(
            match.documentation.includes(ei.documentationFragment),
            `${match.documentation}\ndoes not include\n${ei.documentationFragment}`
          );
        } else {
          assert.ok(
            (match.documentation as vscode.MarkdownString).value.includes(ei.documentationFragment),
            `${(match.documentation as vscode.MarkdownString).value}\ndoes not include\n${ei.documentationFragment}`
          );
        }
      }

      if (ei.insertTextValue) {
        if (match.insertText instanceof vscode.SnippetString) {
          assert.strictEqual(match.insertText.value, ei.insertTextValue);
        } else {
          assert.strictEqual(match.insertText, ei.insertTextValue);
        }
      }

      if (ei.textEdit) {
        assert.strictEqual(match.textEdit?.newText, ei.textEdit.newText)
        assert.strictEqual(match.textEdit?.range.start.line, ei.textEdit.range.start.line)
        assert.strictEqual(match.textEdit?.range.start.character, ei.textEdit.range.start.character)
        assert.strictEqual(match.textEdit?.range.end.line, ei.textEdit.range.end.line)
        assert.strictEqual(match.textEdit?.range.end.character, ei.textEdit.range.end.character)
      }
    }
  });
}

export async function testCompletionResolve(
  docUri: vscode.Uri,
  position: vscode.Position,
  expectedItems: CompletionItem[],
  itemResolveCount = 1,
  matchFn?: (ei: CompletionItem) => (result: CompletionItem) => boolean
) {
  await showFile(docUri);

  const result = (await vscode.commands.executeCommand(
    'vscode.executeCompletionItemProvider',
    docUri,
    position,
    undefined,
    itemResolveCount
  )) as vscode.CompletionList;

  expectedItems.forEach(ei => {
    if (typeof ei === 'string') {
      assert.ok(
        result.items.some(i => i.label === ei),
        `Can't find matching item for\n${JSON.stringify(ei, null, 2)}\nSeen items:\n${JSON.stringify(
          result.items,
          null,
          2
        )}`
      );
    } else {
      const match = matchFn ? result.items.find(matchFn(ei)) : result.items.find(i => i.label === ei.label);
      if (!match) {
        assert.fail(
          `Can't find matching item for\n${JSON.stringify(ei, null, 2)}\nSeen items:\n${JSON.stringify(
            result.items,
            null,
            2
          )}`
        );
      }

      assert.equal(match.label, ei.label);
      if (ei.kind) {
        assert.equal(match.kind, ei.kind);
      }
      if (ei.detail) {
        assert.equal(match.detail, ei.detail);
      }

      if (ei.documentation) {
        if (typeof match.documentation === 'string') {
          assert.equal(normalizeNewline(match.documentation), normalizeNewline(ei.documentation as string));
        } else {
          if (ei.documentation && (ei.documentation as MarkdownString).value && match.documentation) {
            assert.equal(
              normalizeNewline((match.documentation as vscode.MarkdownString).value),
              normalizeNewline((ei.documentation as MarkdownString).value)
            );
          }
        }
      }

      if (ei.additionalTextEdits) {
        assert.strictEqual(match.additionalTextEdits?.length, ei.additionalTextEdits.length);

        ei.additionalTextEdits.forEach((textEdit, i) => {
          assert.strictEqual(match.additionalTextEdits?.[i].newText, textEdit.newText);
          assert.strictEqual(match.additionalTextEdits?.[i].range.start.line, textEdit.range.start.line);
          assert.strictEqual(match.additionalTextEdits?.[i].range.start.character, textEdit.range.start.character);
          assert.strictEqual(match.additionalTextEdits?.[i].range.end.line, textEdit.range.end.line);
          assert.strictEqual(match.additionalTextEdits?.[i].range.end.character, textEdit.range.end.character);
        });
      }
    }
  });
}

export async function testNoSuchCompletion(
  docUri: vscode.Uri,
  position: vscode.Position,
  notExpectedItems: (string | ExpectedCompletionItem)[]
) {
  await showFile(docUri);

  const result = (await vscode.commands.executeCommand(
    'vscode.executeCompletionItemProvider',
    docUri,
    position
  )) as vscode.CompletionList;

  notExpectedItems.forEach(ei => {
    if (typeof ei === 'string') {
      assert.ok(
        !result.items.some(i => {
          return i.label === ei;
        })
      );
    } else {
      const match = result.items.find(i => {
        for (const x in ei) {
          if (ei[x] !== i[x]) {
            return false;
          }
        }
        return true;
      });

      assert.ok(!match, `Shouldn't find perfect match for ${JSON.stringify(ei, null, 2)}`);
    }
  });
}

function normalizeNewline(input: string) {
  return input.replace(/\r\n/g, '\n');
}
