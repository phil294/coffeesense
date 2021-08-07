import { createConnection, InitializeParams, InitializeResult } from 'vscode-languageserver/node';
import { LSP } from './services/lsp';

const connection = process.argv.length <= 2 ? createConnection(process.stdin, process.stdout) : createConnection();

console.log = (...args: any[]) => connection.console.log(args.join(' '));
console.error = (...args: any[]) => connection.console.error(args.join(' '));

const cls = new LSP(connection);
connection.onInitialize(async (params: InitializeParams): Promise<InitializeResult> => {
  await cls.init(params);

  console.log('CoffeeSense initialized');

  return {
    capabilities: cls.capabilities
  };
});

cls.listen();
