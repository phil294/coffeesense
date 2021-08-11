## CoffeeSense Language Server

[CoffeeSense Language Server](https://www.npmjs.com/package/coffeesense-language-server) is a language server implementation compatible with [Language Server Protocol](https://github.com/microsoft/language-server-protocol) for [CoffeeScript](https://coffeescript.org).

CoffeeSense is the VS Code extension consuming `coffeesense-language-server`.

It's possible for other LSP compatible editors to build language server clients that consume `coffeesense-language-server`.

Please note that it is not feature-complete due to the limitations of its technical architecture. Some features of it are not supported. Some parts also have some issues. Check out the [README of the parent VSCode extension project](https://github.com/phil294/coffeesense).

## Usage (outside of VSCode `CoffeeSense` Extension)

See https://github.com/vuejs/vetur/blob/master/server/README.md for how you do it in principle. `coffeesense-language-server` is on NPM so you can install it for example with `npm install coffeesense-language-server -g`.