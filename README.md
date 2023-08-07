# CoffeeSense
## [CoffeeScript](https://coffeescript.org) [LSP](https://github.com/microsoft/language-server-protocol) implementation

<p align="end">
  <a href="https://marketplace.visualstudio.com/items?itemName=phil294.coffeesense">
    <img src="https://img.shields.io/visual-studio-marketplace/v/phil294.coffeesense?label=%20">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=phil294.coffeesense">
    <img src="https://img.shields.io/visual-studio-marketplace/i/phil294.coffeesense?label=%20">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=phil294.coffeesense">
    <img src="https://img.shields.io/visual-studio-marketplace/r/phil294.coffeesense?label=%20">
  </a>
  <a href="https://github.com/phil294/coffeesense/actions?query=workflow%3A%22Node+CI%22">
    <img src="https://img.shields.io/github/actions/workflow/status/phil294/coffeesense/ci.yml?label=tests">
  </a>
  <br>
</p>

![Demo](https://github.com/phil294/coffeesense/blob/master/images/demo.gif?raw=true)

### What

CoffeeSense gives you IntelliSense (autocompletion, go to implementation, etc.) for CoffeeScript. It is based on CoffeeScript's compiled JavaScript output. Because of this, this LSP implementation is and can **not** be feature-complete due to the limitations of its technical architecture. See further below for details.

Source code derived from the great [Vetur](https://github.com/vuejs/vetur) project (but CoffeeSense has nothing to do with Vue.js otherwise).

You also might want to check out [Civet](https://civet.dev/), a more modern alternative to CoffeeScript.

### How

You can **install the extension in VSCode from [HERE](https://marketplace.visualstudio.com/items?itemName=phil294.coffeesense)** or for VSCodium from [Open VSX Registry](https://open-vsx.org/extension/phil294/coffeesense) or use it as a standalone lsp server if you want that (see [server](server/README.md)). Neovim users might find a working solution [here](https://github.com/neovim/nvim-lspconfig/pull/2376).

### Features

- [x] **Validation**: CoffeeScript compilation errors
- [x] **TypeScript type checking**
    - Be sure to include `#@ts-check` at the top of your script or set `checkJs=true` in your `jsconfig.json` in your workspace root ([details](https://code.visualstudio.com/docs/nodejs/working-with-javascript)). For multi-root or nested projects or custom file extensions, see [setup](docs/guide/setup.md) and [FAQ](docs/guide/FAQ.md).
    - You can use [JSDoc](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html) comment blocks in your code (see [this issue](https://github.com/phil294/coffeesense/issues/1) for details) to even define types yourself. See [JS Projects Utilizing TypeScript](https://www.typescriptlang.org/docs/handbook/intro-to-js-ts.html) for details
    - Get IntelliSense for imports from Coffee files, JS files, TS files, be it in workspace or `node_modules`, everything should behave as you are familiar from TypeScript ecosystem
- [x] **Autocompletion**: Works even when a line / the current line is invalid syntax (so, while typing, basically). Autocomplete is based on TypeScript.
  - Methods, properties, object parameters etc.
  - Automatic imports
  - There is a constantly growing set of automated completion [tests](https://github.com/phil294/coffeesense/tree/master/test/lsp/fixture) covering all known use cases, so please don't hesitate to aggressively test and report missing or wrong completions
- [x] **Hover information**
- [x] **Signature type hints** Trigger characters are both `(` and ` `  (space)
- [x] **Document highlight**
- **Document symbols**: Usable but not great. Check out [Yorkxin's extension](https://github.com/yorkxin/vscode-coffeescript-support), it provides much better symbols if you need that
- [x] **Find definition**
- [x] **Find references**
- **Code actions**: Organize imports only. Probably only rarely works as you intend it to. Auto imports: Not implemented as code actions, but works while autocompleting.
- [ ] *missing* Quick fix, refactor
- [ ] *missing* Formatting
- [ ] *missing* Rename var
- [ ] *missing* Rename file
- [ ] *missing* Syntactic folding ranges

If you're using *Vue.js*, you can  You can also get coffee language support inside `.vue` single file component files by adding this to your settings: `"files.associations": { "*.vue": "coffeescript" }`. If your file contains a `<script lang="coffee">` section, it will work as expected. This feature disables any other Vue extensions like Vetur/Volar though, so activate with caution.

### Setup

The following VSCode extension options are available. The default values are set.

```jsonc
{
  // Some TypeScript errors don't make a lot of sense in CS context (see main README), you can ignore them here by supplying their IDs.
  // Some error code suggestions you might want to add here:
  // 7030: Not all code paths return a value
  // 7023: 'your_var' implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.
  "coffeesense.ignoredTypescriptErrorCodes": [],
  // CoffeeSense will warn about not setup correctly for the project. You can disable it.
  "coffeesense.ignoreProjectWarning": false,
  // Use dependencies from workspace package.json. Currently only for TypeScript.
  "coffeesense.useWorkspaceDependencies": false,
  // Traces the communication between VS Code and CoffeeSense Language Server.
  "coffeesense.trace.server": "off", // Possible values: "off", "messages", "verbose"
  // Path to lsp for CoffeeSense developers. There are two ways of using it.   
  // 1. Clone phil294/coffeesense from GitHub, build it and point it to the ABSOLUTE path of `/server`.
  // 2. `yarn global add coffeesense-language-server` and point CoffeeSense to the installed location (`yarn global dir` + node_modules/coffeesense-language-server)
  "coffeesense.dev.lspPath": null,
  // The port that the lsp listens to. Can be used for attaching to the LSP Node process for debugging / profiling.
  "coffeesense.dev.lspPort": null,
  // Log level for the lsp"
  "coffeesense.dev.logLevel": "INFO" // Possible values: "INFO", "DEBUG"
}
```


### Why

Overall, this implementation works, but is not optimal. It is eagerly waiting to be replaced by a native, feature-complete `coffeescript-language-server` or the like some day, but so far, no one has done that yet, so it seems this is the best we have for now.

### But

There is lot of hacky code to get this all to work. One thing to keep in mind is that the generated JS code that tsserver gets to provide compilation/type errors for differs from normal CS compilation output. You can inspect the generated JS code for the active file using the command `CoffeeSense: Show generated JavaScript for current file`.

#### Known problems
- Compilation:
  - Sometimes ranges fail to compile properly ([reason](https://github.com/jashkenas/coffeescript/pull/5395#issuecomment-1243036327). This will be fixed at some point.
- Types:
  - Annotating constructor `@parameters` with JSDoc can not provide type hints when you use a variable with the same name outside ([issue](https://github.com/phil294/coffeesense/issues/5)). This will be fixed at some point.
- General:
  - Make sure you never leave any dangling indentation in your source code around, unless it's the line you are working on. In VSCode, this is the default - just make sure to **not** override `"editor.trimAutoWhitespace"` to `false`. Keep it at its default `true`. Same thing goes for other IDEs: Try not to have more than one empty line with indentation. This is because CoffeeSense treats any line with indent as a possible place for you to define new object properties or arguments, as it is not aware of the cursor position while compiling. It injects certain characters at these lines which gets messy if you're on another line.
  - Avoid trailing whitespace because it takes on special meaning
  - Autocompletion is optimized for the common code style of single space spacing. E.g. it is better to write `a = b: c` instead of `a=b:c` as the test cases simply do not cover the latter.
- Cosmetics:
  - JSDoc lines with trailing space or dot can look funny in tooltips if you don't start the line with a number sign ([issue](https://github.com/phil294/coffeesense/issues/11)).

Also, implicit any errors (7006) for variables named `_` are ignored.

### Contribute

Please feel free to open an issue if you find bugs, but be aware some might be set in stone. I have not encountered any dealbreakers yet.

If you'd like to contribute or simply wonder how this works, check out [CONTRIBUTING.md](CONTRIBUTING.md)