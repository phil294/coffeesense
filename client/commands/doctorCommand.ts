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
    const action = await vscode.window.showInformationMessage(showText, { modal: true }, 'Ok', 'Copy');
    if (action === 'Copy') {
      await vscode.env.clipboard.writeText(result);
    }
  };
}
