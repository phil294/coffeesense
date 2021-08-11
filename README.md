# CoffeeSense
## [CoffeeScript](https://coffeescript.org) [LSP](https://github.com/microsoft/language-server-protocol) implementation

### What

CoffeeSense gives you IntelliSense (autocompletion, go to implementation, etc.) for CoffeeScript. It is based on CoffeeScript's compiled JavaScript output. Because of this, this LSP implementation is and can **not** be feature-complete due to the limitations of its technical architecture. See further below for details.

Source code derived from the great [Vetur](https://github.com/vuejs/vetur) project (but CoffeeSense has nothing to do with Vue.js otherwise).

### How

You can **install the extension in VSCode from [HERE](https://marketplace.visualstudio.com/items?itemName=phil294.coffeesense)** or use it as a standalone lsp server if you want that (see [server](server/README.md)).

### Features

- **Validation**
  - CoffeeScript compilation errors
  - TypeScript type checking
    - Be sure to include `//@ts-check` at the top of your script or set `checkJs=true` in your `jsconfig.json` in your workspace root. Proper configuration, project subfolders etc. might work? See [Vetur docs](https://vuejs.github.io/vetur), I haven't touched that part.
    - You can use [JSDoc](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html) comment blocks in your code [like this](https://github.com/jashkenas/coffeescript/issues/5366) to even define types yourself. See [JS Projects Utilizing TypeScript](https://www.typescriptlang.org/docs/handbook/intro-to-js-ts.html) for details
    - Work with imports from JS files, TS files, be it in workspace or `node_modules`, everything should behave as you are familiar from TypeScript ecosystem
    - *missing, TO DO:* Work with imports from other CoffeeScript files. This makes it currently uncomfortable working in a codebase with several coffee files. Will try to fix this soon
- **Autocompletion**: Complicated but works reasonably well. Can even function when a line / the current line is invalid syntax (so, while typing, basically), but results may be a bit more unpredictable at times. Autocomplete is based on TypeScript.
  - Methods, properties etc.
  - *missing, TO DO:* Automatic imports
- **Hover information**: Works well
- **Signature type hints** (trigger characters both `,` and ` ` (space)). Similar to validation
- **Document highlight**: Works well
- **Document symbols**: Usable
- **Find definition** (jump to source): Works well, but probably in current file only
- **Find references**: Probably works in current file only
- **Code actions**: Organize imports only. Probably only rarely works as you intend it to.
- *missing* Quick fix, refactor
- *missing* Formatting
- *missing* Rename var
- *missing* Rename file
- *missing* Syntactic folding ranges

### Why

Overall, this implementation works, but is not optimal. It is eagerly waiting to be replaced by a native, feature-complete `coffeescript-language-server` or the like some day, but so far, no one has done that yet, so it seems this is the best we have for now.

### Other problems

The following coffee code will never produce an error, even with TS `noImplicitAny=true`:
```coffeescript
a = 1
a = 'one'
```
This is because the cs compiler puts variable declarations to the front:
```js
// Translates to:
var a;
a = 1;
a = 'one';
```
and now `a` is of type `number | string`. Please see https://github.com/microsoft/TypeScript/issues/45369 for further details. If you have a good solution for this problem, let me know.

### Nice

Please feel free to open an issue if you find bugs, but be aware some might be set in stone. I have not encountered any dealbreakers yet.

If you'd like to contribute or simply wonder how this works, check out [CONTRIBUTING.md](CONTRIBUTING.md)