This repository is a fork of [Vetur](https://github.com/vuejs/vetur). Vetur itself is partly adopted from VSCode's [Language Features for HTML](https://github.com/microsoft/vscode/tree/main/extensions/html-language-features) extension and incorporates VSCode [Language Services](https://code.visualstudio.com/api/language-extensions/embedded-languages#language-services) extension architecture. Vetur integrates several language services next to TS (html, sass etc.). All of these have been [removed](server/src/embeddedSupport/coffeescriptDocumentRegionParser.ts). But this is why things like [languageModes.ts](server/src/embeddedSupport/languageModes.ts) exists. We could simplify these parts, but there isn't much to be gained from it. Also it's neat to keep it close to upstream to simplify rebasing.

To help you getting started on contributing:

The interesting stuff happens here:
 - [Compile to JS](https://github.com/phil294/coffeesense/blob/master/server/src/embeddedSupport/embeddedSupport.ts#L112) (one line)
 - [javascript.ts](server/src/modes/script/javascript.ts). You can see most of what was added to it in [76b990](https://github.com/phil294/coffeesense/commit/76b990d3f8f82ace1c0dd1324b69030db7e2a940#diff-93c575dade32a8ec4937b3484be59eca7e019d22408de3350e61a24772dccb7). Mostly, positions and ranges are mapped back and forth between JS and CS
 - [transpileService.ts](server/src/services/transpileService.ts). This is the only major file that was added. It provides compiling capabilities and mapping functions. It also contains a faked coffee compilation step to enable autocomplete in syntactically incorrect coffee files, but with one erroneous line only. With more than one error line, compilation finally fails and the raw coffee code is fed into the TS service (in `embeddedSupport`). This can still provide useful info for global variable and imports. With some hacking, we might achieve local variable type context in that case too. --- `transpileService` brings its own state and cache and thus is not really integrated into the rest of the system but rather a standalone module.

Why is such a bloated structure necessary then, you might wonder. Reason being convenience and TS compiler, [its usage api is complex](https://github.com/microsoft/TypeScript-wiki/blob/main/Using-the-Compiler-API.md). To pass it virtual file contents, you need to pass it a custom host service. You could use something like [ts-morph](https://github.com/dsherret/ts-morph) but this makes achieving performance a hard task. You could use [request forwarding](https://code.visualstudio.com/api/language-extensions/embedded-languages#request-forwarding) (not lsp) but that does not support diagnostics which are server-push only, and Go To imports are impossible. You could use an [existing TS LSP implementation](https://github.com/theia-ide/typescript-language-server) for imports resolving. I went all of these approaches and unified them in another single extension. You can find it [here](https://github.com/phil294/minimal-coffeescript-intellisense). It also kind of works, but worse, and it is very slow, bulky, and cannot be used outside VSCode.

A disadvantage of the current project structure is the inability to pass dynamic content to TS service. For example, in `javascript.ts#doSignatureHelp`,
```ts
const signatureHelpItems = service.getSignatureHelpItems(fileFsPath, scriptDoc.offsetAt(position), undefined);
```
you cannot pass special file contents to the service (`getSignatureHelpItems(alteredJs)`), but it would be handy. In the case of signature help provider, it would be great to just replace dangling spaces with opening braces and change compilation process as we don't care for syntax correctness in this place. Instead, it is baked into the compilation step in `transpileService` directly which also works but is a bit annoying. Would be good to fix this some day.

### Code style

Code specific to this repository follows `underscore_variable` naming. This greatly helps to differentiate it from Vetur/dependencies code. Also omit semicolons.
Remaining formatting standards remain untouched to upstream.

### Build

First, install modules using `yarn`, then in VSCode, run the task `npm watch`, then run `all`. This launches both the ide client and the lsp server.
In the alternative client VSCodium, the tests always fail for some reason, here you need to run them via cli.

### Tests

There are only integration tests which spin up an entire VSCode instance and emulate user interaction. This is simply adopted from Vetur. This should theoretically also be possible with unit tests (much faster), but setting up the architecture including tsserver for this is probably considerable work. Finally, some tests do not rely on TS (compilation tests only) and could therefore be entirely decoupled.