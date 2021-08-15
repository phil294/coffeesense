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
    - Be sure to include `//@ts-check` at the top of your script or set `checkJs=true` in your `jsconfig.json` in your workspace root. For multi-root or nested projects, see [setup](docs/guide/setup.md) and [FAQ](docs/guide/FAQ.md).
    - You can use [JSDoc](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html) comment blocks in your code [like this](https://github.com/jashkenas/coffeescript/issues/5366) to even define types yourself. See [JS Projects Utilizing TypeScript](https://www.typescriptlang.org/docs/handbook/intro-to-js-ts.html) for details
    - Get IntelliSense for imports from Coffee files, JS files, TS files, be it in workspace or `node_modules`, everything should behave as you are familiar from TypeScript ecosystem
- [x] **Autocompletion**: Works even function when a line / the current line is invalid syntax (so, while typing, basically), but results may be a bit more unpredictable at times. Autocomplete is based on TypeScript.
  - Methods, properties etc.
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

### Other problems

If you set `"noImplicitAny":true` or `"strict":true`, code like the following will give you errors:
```coffeescript
xy = 123   # Error: Variable 'xy' implicitly has type 'any' in some locations where its type cannot be determined.CoffeeSense [TS](7034)
=> xy      # Error: Variable 'xy' implicitly has an 'any' type.CoffeeSense [TS](7005)
```
You can hide these messages by adding `7034` and `7005` to `ignoredTypescriptErrorCodes` in [settings](docs/guide/setup.md).

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
and [now `a` is of type `number | string`](https://github.com/microsoft/TypeScript/issues/45369). 

This also happens for example with object property access:
```coffeescript
a =
    b: ->
        # Should be a type error but is not :-/
        @c
```
This e.g. means that autocompletion based on `this.` is not possible.

If you have a solution for this problem, let me know.

For more general discussion, see [this issue](https://github.com/jashkenas/coffeescript/issues/5307)

### Contribute

Please feel free to open an issue if you find bugs, but be aware some might be set in stone. I have not encountered any dealbreakers yet.

If you'd like to contribute or simply wonder how this works, check out [CONTRIBUTING.md](CONTRIBUTING.md)
