Please check back later, repo isn't finished yet

Notes:

CoffeeSense

CoffeeScript LSP implementation based on its compiled JavaScript output. Can be used as a VSCode extension or standalone lsp server (see `/server`)

Source code derived from [Vetur](https://github.com/vuejs/vetur) (but this project has nothing to do with Vue.js otherwise).

Features working per se, albeit all of them have some issues:
- Validation: Both CS compilation and TS type checking. Be sure to include `//@ts-check` at the top of your script or set `checkJs=true` in your `jsconfig.json` in your workspace root. Proper configuration, project subfolders etc. should work but probably does not right now
- Autocompletion: Complicated but works reasonably well. Can even function when a line / the current line is invalid syntax (so, while typing, basically), but results may be a bit more unpredictable at times. Autocomplete is based on surrounding variable types, imports etc.
- Hover information: Works well
- Signature type hints (trigger characters both `,` and ` ` (space)). Similar to validation
- Document highlight: Works well
- Document symbols: Usable
- Find definition (jump to source): Works well, but probably in current file only
- Find references: Probably works in current file only
- Code actions: Organize imports only. Probably rarely works as intended.

TODO

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
and now `a` is of type `number | string`. Please see https://github.com/microsoft/TypeScript/issues/45369 for further details. If you have a solution for this problem, please open an issue.

also,
https://github.com/jashkenas/coffeescript/issues/5366