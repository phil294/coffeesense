import vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { initializeLanguageClient } from './client';
import { join } from 'path';
import { generateDoctorCommand } from './commands/doctorCommand';

export async function activate(context: vscode.ExtensionContext) {
  /**
   * CoffeeSense Language Server Initialization
   */

  const serverModule = context.asAbsolutePath(join('server', 'dist', 'coffeescriptServerMain.js'));
  const client = initializeLanguageClient(serverModule);
  context.subscriptions.push(client.start());

  const promise = client
    .onReady()
    .then(() => {
      registerCustomLSPCommands(context, client);
      registerRestartLSPCommand(context, client);

      if (context.extensionMode === vscode.ExtensionMode.Test) {
        return {
          /**@internal expose only for testing */
          sendRequest: client.sendRequest.bind(client)
        };
      }
    })
    .catch((e: Error) => {
      console.error(e.stack);
      console.log('Client initialization failed');
    });

  return displayInitProgress(promise);
}

async function displayInitProgress<T = void>(promise: Promise<T>) {
  return vscode.window.withProgress(
    {
      title: 'CoffeeSense initialization',
      location: vscode.ProgressLocation.Window
    },
    () => promise
  );
}

function registerRestartLSPCommand(context: vscode.ExtensionContext, client: LanguageClient) {
  context.subscriptions.push(
    vscode.commands.registerCommand('coffeesense.restartLSP', () =>
      displayInitProgress(
        client
          .stop()
          .then(() => client.start())
          .then(() => client.onReady())
      )
    )
  );
}

function registerCustomLSPCommands(context: vscode.ExtensionContext, client: LanguageClient) {
  context.subscriptions.push(
    vscode.commands.registerCommand('coffeesense.showOutputChannel', () => client.outputChannel.show()),
    vscode.commands.registerCommand('coffeesense.showDoctorInfo', generateDoctorCommand(client))
  );
}
