# CoffeeSense
## [CoffeeScript](https://coffeescript.org) [LSP](https://github.com/microsoft/language-server-protocol) implementation

<p align="end">
  <a href="https://github.com/phil294/coffeesense/actions?query=workflow%3A%22Node+CI%22">
    <img src="https://img.shields.io/github/workflow/status/phil294/coffeesense/Node%20CI?label=tests">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=phil294.coffeesense">
    <img src="https://vsmarketplacebadge.apphb.com/version-short/phil294.coffeesense.svg">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=phil294.coffeesense">
    <img src="https://vsmarketplacebadge.apphb.com/installs-short/phil294.coffeesense.svg?label=%20">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=phil294.coffeesense">
    <img src="https://vsmarketplacebadge.apphb.com/rating-short/phil294.coffeesense.svg?label=%20">
  </a>
  <br>
</p>

![Demo](https://github.com/phil294/coffeesense/blob/master/images/demo.gif?raw=true)

### What

CoffeeSense gives you IntelliSense (autocompletion, go to implementation, etc.) for CoffeeScript. It is based on CoffeeScript's compiled JavaScript output. Because of this, this LSP implementation is and can **not** be feature-complete due to the limitations of its technical architecture. See further below for details.

Source code derived from the great [Vetur](https://github.com/vuejs/vetur) project (but CoffeeSense has nothing to do with Vue.js otherwise).

### How

You can **install the extension in VSCode from [HERE](https://marketplace.visualstudio.com/items?itemName=phil294.coffeesense)** or use it as a standalone lsp server if you want that (see [server](server/README.md)).

### Features

- [x] **Validation**: CoffeeScript compilation errors
- [x] **TypeScript type checking**
    - Be sure to include `#@ts-check` at the top of your script or set `checkJs=true` in your `jsconfig.json` in your workspace root ([details](https://code.visualstudio.com/docs/nodejs/working-with-javascript)). For multi-root or nested projects or custom file extensions, see [setup](docs/guide/setup.md) and [FAQ](docs/guide/FAQ.md).
    - You can use [JSDoc](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html) comment blocks in your code (see [this issue](https://github.com/phil294/coffeesense/issues/1) for details) to even define types yourself. See [JS Projects Utilizing TypeScript](https://www.typescriptlang.org/docs/handbook/intro-to-js-ts.html) for details
    - Get IntelliSense for imports from Coffee files, JS files, TS files, be it in workspace or `node_modules`, everything should behave as you are familiar from TypeScript ecosystem
- [x] **Autocompletion**: Works even when a line / the current line is invalid syntax (so, while typing, basically). Autocomplete is based on TypeScript.
  - Methods, properties, object parameters etc.
  - Automatic imports
- [x] **Hover information**
- [x] **Signature type hints** Trigger characters are both `(` and ` `  (space)
- [x] **Document highlight**
- **Document symbols**: Usable but not great. Check out [Yorkxin's extension](https://github.com/yorkxin/vscode-coffeescript-support), it provides much better symbols if you need that
- [x] **Find definition**
- [x] **Find references**
- **Code actions**: Organize imports only. Probably only rarely works as you intend it to.
- [ ] *missing* Quick fix, refactor
- [ ] *missing* Formatting
- [ ] *missing* Rename var
- [ ] *missing* Rename file
- [ ] *missing* Syntactic folding ranges

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
- Types:
  - Type inference of variables can sometimes fail if they are prefixed with a comment block, such as JSDoc. This is temporary and probably fixed soon.
  - Annotating constructor `@parameters` with JSDoc can not provide type hints when you use a variable with the same name outside ([issue](https://github.com/phil294/coffeesense/issues/5)). This will be fixed at some point.
- Method parameters:
  - You can't get param hints in an *indented* line that ends with `(`. It does work in top level lines or inside `()` or with space instead of braces though.
- General:
  - Make sure you never leave any dangling indentation in your source code around, unless it's the line you are working on. In VSCode, this is the default - just make sure to **not** override `"editor.trimAutoWhitespace"` to `false`. Keep it at its default `true`. Same thing goes for other IDEs: Try not to have more than one empty line with indentation. This is because CoffeeSense treats any line with indent as a possible place for you to define new object properties or arguments, as it is not aware of the cursor position while compiling. It injects certain characters at these lines which gets messy if you're on another line.

Also, implicit any errors (7006) for variables named `_` are ignored.

### Contribute

Please feel free to open an issue if you find bugs, but be aware some might be set in stone. I have not encountered any dealbreakers yet.

If you'd like to contribute or simply wonder how this works, check out [CONTRIBUTING.md](CONTRIBUTING.md)

### Changelog

#### 1.4.0
##### 2022-02-28
- Improve object autocomplete and internals. Several small internal changes and improvements regarding objects
- Add support for go tos in basic comprehensions. Go Tos now in general try to find the nearest previous variable assignment of the word the cursor is under, if no match could be found by asking tsserver. This is a primitive fallback method and can sometimes pont to wrong lines but works in most scenarios.
- Fix error of different autocomplete results for subsequent requests
- Enable autocomplete while building a brace syntax object, without having a valid closing brace yet
- Improve/fix autocomplete for strings and imports, now also completes partial strings
- Fix autocomplete inside empty import values braces `import {} from ...`
- Revert `1.2.0` change (variable assignment detection logic change), as it does not yet handle comment blocks appropriately and messes up JSDoc sometimes
- Fix wrong completion text at `@` (resolved falsely to `@this.theCompletionText`)
- Add autocomplete for local import path completion
- Internal: Added automatic tests for all known features of this extension

#### 1.3.0
##### 2022-02-25
- Allow configuring additional file extensions other than `.coffee` using VSCode's setting `files.associations` or `coffeesense.fileExtensions` for other IDEs. (#9)
- Fix syntax check for files with lines ending on an open brace `(` (#8)
- Add list of known problems to the README
- Debug: Add "Show JS" button to inspection popup

#### 1.2.1
##### 2022-01-27
- Improve diagnostics location of JSDoc comment errors: Show at next available code line instead of always beginning of file

#### 1.2.0
##### 2022-01-25
- Improve automatic type detection at variable assignment time: Less error-prone, and now also supports more complex use cases such as loops and destructuring assignments. This was possible by switching the CoffeeScript compiler to a recent contribution by @edemaine at https://github.com/jashkenas/coffeescript/pull/5395

#### 1.1.11
##### 2022-01-13
- Fix autocomplete in if-statements etc. if next line is indented
- Fix signature help after dangling opening brace in some cases
- Add Readme note about VSCode `trimAutoWhitespace` problems

#### 1.1.10
##### 2022-01-08
- Fix autocomplete in rare cases after dot (test case: `=>\n\twindow.|\n\tx = 1`)

#### 1.1.9
##### 2022-01-08
- Fix syntax around empty yet indented lines under certain circumstances: `\t\n\t\tsomething` failed useful compilation because of the increasing indentation
- Fix (?) autocompletion inside objects while current line is invalid (while typing)

#### 1.1.8
##### 2022-01-06
- Fix autocomplete after dot in otherwise empty line, e.g. `abc\n.|`

#### 1.1.7
##### 2022-01-02
- Fix whole word error diagnostics range highlighting: Sometimes, predominantly with errors in method arguments, errors were only shown for the very first character in a word. Now it should expand up to the next whitespace etc.

#### 1.1.6
##### 2021-11-30
- Fix autocomplete in empty lines when using space indentation

#### 1.1.5
##### 2021-11-30
- Docs: Move VSCode extension options explanation section ("Setup") from `setup.md` to the README so they are visible in the marketplace

#### 1.1.4
##### 2021-11-22
- Fix autocomplete after dot `.` when next line is a comment
- Fix autocompleting object properties in non-empty lines

#### 1.1.3
##### 2021-11-16
- Fix GoTo when variable name contains dollar sign `$`

#### 1.1.2
##### 2021-10-14
- Fix wrong TS version under specific conditions with `useWorkspaceDependencies: true`

#### 1.1.1
##### 2021-10-01
- Internally compile object methods (`{ foo: -> }`) via [object method definition shorthand](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Method_definitions) (`{ foo() {} }`) instead of normal CS compiler output (`{ foo: function() {} }`). This should not affect the logic at all, but it fixes TS typing in Vue.js object notation files, for some reason.

#### 1.1.0
##### 2021-09-05
- Add autocompletion at `@`

#### 1.0.0
##### 2021-09-04
