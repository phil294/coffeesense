import assert from 'assert';
import vscode from 'vscode';
import { showFile } from './editorHelper';

export async function testDefinition(docUri: vscode.Uri, position: vscode.Position, expectedLocation: vscode.Location) {
  await showFile(docUri);

  const result = (await vscode.commands.executeCommand(
    'vscode.executeDefinitionProvider',
    docUri,
    position
  )) as vscode.Location[];

  const r = result[0]?.range
  assert.ok(r.isEqual(expectedLocation.range), 'range wrong: '+ [r?.start.line, r?.start.character, r?.end.line, r?.end.character].join(', '));
  assert.equal(result[0].uri.fsPath, expectedLocation.uri.fsPath);
}
