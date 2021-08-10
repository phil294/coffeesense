## CoffeeSense Language Server

BELOW TEXT IS NOT FULLY CORRECT, PACKAGE WAS NOT YET PUBLISHED TO NPM

[CoffeeSense Language Server](https://www.npmjs.com/package/coffeesense-language-server) is a language server implementation compatible with [Language Server Protocol](https://github.com/microsoft/language-server-protocol).

CoffeeSense is the VS Code extension consuming `coffeesense-language-server`.

It's possible for other LSP compatible editors to build language server clients that consume `coffeesense-language-server`.

Please note that this is *not* a complete LSP implementation due to its technical architecture. Only some parts of it are supported. This implementation is eager to be replaced by a native, feature-complete `coffeescript-language-server` some day, but so far, no one has done that yet.

## Usage (outside of VSCode `CoffeeSense` Extension)

See https://github.com/vuejs/vetur/blob/master/server/README.md for how you do it in principle. `coffeesense-language-server` is on NPM so you can install it for example with `npm install coffeesense-language-server -g`.