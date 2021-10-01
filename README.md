# CoffeeSense
## [CoffeeScript](https://coffeescript.org) [LSP](https://github.com/microsoft/language-server-protocol) implementation

![Demo](https://github.com/phil294/coffeesense/blob/master/images/demo.gif?raw=true)

### What

CoffeeSense gives you IntelliSense (autocompletion, go to implementation, etc.) for CoffeeScript. It is based on CoffeeScript's compiled JavaScript output. Because of this, this LSP implementation is and can **not** be feature-complete due to the limitations of its technical architecture. See further below for details.

Source code derived from the great [Vetur](https://github.com/vuejs/vetur) project (but CoffeeSense has nothing to do with Vue.js otherwise).

### How

You can **install the extension in VSCode from [HERE](https://marketplace.visualstudio.com/items?itemName=phil294.coffeesense)** or use it as a standalone lsp server if you want that (see [server](server/README.md)).

### Features

- [x] **Validation**
  - CoffeeScript compilation errors
  - TypeScript type checking
    - Be sure to include `#@ts-check` at the top of your script or set `checkJs=true` in your `jsconfig.json` in your workspace root ([details](https://code.visualstudio.com/docs/nodejs/working-with-javascript)). For multi-root or nested projects, see [setup](docs/guide/setup.md) and [FAQ](docs/guide/FAQ.md).
    - You can use [JSDoc](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html) comment blocks in your code (see [this issue](https://github.com/phil294/coffeesense/issues/1) for details) to even define types yourself. See [JS Projects Utilizing TypeScript](https://www.typescriptlang.org/docs/handbook/intro-to-js-ts.html) for details
    - Get IntelliSense for imports from Coffee files, JS files, TS files, be it in workspace or `node_modules`, everything should behave as you are familiar from TypeScript ecosystem
- [x] **Autocompletion**: Works even function when a line / the current line is invalid syntax (so, while typing, basically), but results may be a bit more unpredictable at times. Autocomplete is based on TypeScript.
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

### Why

Overall, this implementation works, but is not optimal. It is eagerly waiting to be replaced by a native, feature-complete `coffeescript-language-server` or the like some day, but so far, no one has done that yet, so it seems this is the best we have for now.

### But

There is lot of hacky code to get this all to work. One thing to keep in mind is that the generated JS code that tsserver gets to provide compilation/type errors for differs from normal CS compilation output. You can inspect the generated JS code for the active file using the command `CoffeeSense: Show generated JavaScript for current file`.

Also, implicit any errors (7006) for variables named `_` are ignored.

### Contribute

Please feel free to open an issue if you find bugs, but be aware some might be set in stone. I have not encountered any dealbreakers yet.

If you'd like to contribute or simply wonder how this works, check out [CONTRIBUTING.md](CONTRIBUTING.md)

### Changelog

#### 1.1.1
##### 2021-10-01
- Internally compile object methods (`{ foo: -> }`) via [object method definition shorthand](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Method_definitions) (`{ foo() {} }`) instead of normal CS compiler output (`{ foo: function() {} }`). This should not affect the logic at all, but it fixes TS typing in Vue.js object notation files, for some reason.

#### 1.1.0
##### 2021-09-05
- Add autocompletion at `@`

#### 1.0.0
##### 2021-09-04
