import vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

export function generateDoctorCommand(client: LanguageClient) {
  return async () => {
    const LANGUAGE_ID = 'coffeescript'
    if(vscode.window.activeTextEditor?.document.languageId !== LANGUAGE_ID) {
      return vscode.window.showInformationMessage(`Failed to showGeneratedJavascript. Make sure the current file is a ${LANGUAGE_ID} file.`);
    }
    const active_filename = vscode.window.activeTextEditor!.document.fileName

    const result = (await client.sendRequest('$/doctor', { fileName: active_filename })) as string;
    const showText = result.slice(0, 1000) + '....';
    const action = await vscode.window.showInformationMessage(showText, { modal: true }, 'Ok', 'Copy', 'Show JS');
    if (action === 'Copy') {
      await vscode.env.clipboard.writeText(result);
    } else if (action === 'Show JS') {
      const new_doc = await vscode.workspace.openTextDocument({ language: 'javascript' })
      const new_editor = await vscode.window.showTextDocument(new_doc)
      const js = JSON.parse(result).js
      await new_editor.edit(t => t.insert(new vscode.Position(0, 0), js), { undoStopBefore: true, undoStopAfter: false })
    }
  };
}
