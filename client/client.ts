import vscode from 'vscode';
import {
  LanguageClient,
  RevealOutputChannelOn,
  ServerOptions,
  TransportKind,
  LanguageClientOptions,
  DocumentFilter
} from 'vscode-languageclient/node';
import { resolve } from 'path';
import { existsSync } from 'fs';

export function initializeLanguageClient(lspModulePath: string): LanguageClient {
  const debugOptions = { execArgv: ['--nolazy', '--inspect=6005'] };

  const documentSelector: DocumentFilter[] = [{ language: 'coffeescript', scheme: 'file' }];
  const config = vscode.workspace.getConfiguration();

  let serverPath;

  const devLspPackagePath = config.get('coffeesense.dev.lspPath', '');
  if (devLspPackagePath && devLspPackagePath !== '' && existsSync(devLspPackagePath)) {
    serverPath = resolve(devLspPackagePath, 'dist/coffeescriptServerMain.js');
  } else {
    serverPath = lspModulePath;
  }

  const runExecArgv: string[] = [];
  const lspPort = config.get('coffeesense.dev.lspPort');
  if (lspPort !== -1) {
    runExecArgv.push(`--inspect=${lspPort}`);
    console.log(`Will launch LSP in port: ${lspPort}`);
  }

  const serverOptions: ServerOptions = {
    run: { module: serverPath, transport: TransportKind.ipc, options: { execArgv: runExecArgv } },
    debug: { module: serverPath, transport: TransportKind.ipc, options: debugOptions }
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector,
    synchronize: {
      configurationSection: ['coffeesense', 'javascript', 'typescript'],
      fileEvents: vscode.workspace.createFileSystemWatcher('{**/*.js,**/*.ts,**/*.json}', false, false, true)
    },
    initializationOptions: {
      config
    },
    revealOutputChannelOn: RevealOutputChannelOn.Never
  };

  return new LanguageClient('coffeesense', 'CoffeeSense Language Server', serverOptions, clientOptions);
}
