import vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

export function generateDoctorCommand(client: LanguageClient) {
  return async () => {
    if (!vscode.window.activeTextEditor || !vscode.window.activeTextEditor.document.fileName.endsWith('.coffee')) {
      return vscode.window.showInformationMessage('Failed to showGeneratedJavascript. Make sure the current file is a .coffee file.');
    }

    const fileName = vscode.window.activeTextEditor.document.fileName;

    const result = (await client.sendRequest('$/doctor', { fileName })) as string;
    const showText = result.slice(0, 1000) + '....';
    const action = await vscode.window.showInformationMessage(showText, { modal: true }, 'Ok', 'Copy');
    if (action === 'Copy') {
      await vscode.env.clipboard.writeText(result);
    }
  };
}
