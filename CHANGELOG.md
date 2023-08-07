### Changelog

<div style="color:grey; font-size:x-small">
<p>A <code>|</code> anywhere below refers to the respective cursor position.
<details>
  <summary>legend</summary>
  <p>Features like "autocomplete" mostly refer to the setup, not the actual results. Just because CoffeeSense supports autocomplete at <code>a = "|</code>, this obviously does not mean you'll actually see suggestions: It also requires that <code>a</code> has a defined string union type, usually via JSDoc.
  <p>This changelog follows semver versioning. <code>Fix</code> generally refers to features that should have already worked / regressions (resulting in patch version bump). <code>Add</code> (minor version bump) refers to new features or subfeatures: For example autocomplete cases that haven't worked before are <code>Add</code>, as CoffeeSense does not yet officially "support autocomplete", just parts of it. (valid since 1.2.0)
</details>
</div>

#### 1.15.0
##### 2023-08-08
- [`68c0c304`](https://github.com/phil294/coffeesense/commit/68c0c304) Add Vue file support: If you change the type of your `.vue` files to coffeescript (`"files.associations": { "*.vue": "coffeescript" }`) and your `.vue` file contains a `<script lang="coffee">` section, it will work as expected. This feature disables any other Vue extensions like Vetur/Volar though, so activate with caution. Only one can be active at the same time. For current status on integrating both together, follow https://github.com/vuejs/language-tools/issues/3200
- [`be4f4691`](https://github.com/phil294/coffeesense/commit/be4f4691) Fix rare server crashes with broken files

#### 1.14.0
##### 2023-08-06
- [`cad51513`](https://github.com/phil294/coffeesense/commit/cad51513) Fix positioning of comment blocks: Now no more double backtick or leading single line `#` is necessary, because the extension does this internally for you now - everything should be positioned where it belongs in output JS. (#1)
- [`62bc20f6`](https://github.com/phil294/coffeesense/commit/62bc20f6) Link [Civet](https://civet.dev/)
- [`1c4cf003`](https://github.com/phil294/coffeesense/commit/1c4cf003) Upgrade TypeScript from ^4.7.1-rc to 5.1.6. Note that you can always use your own by setting `{ useWorkspaceDependencies: true }`.
- [`b906017f`](https://github.com/phil294/coffeesense/commit/b906017f) Fix badges

#### 1.13.0
##### 2022-09-04
- [`d5418245`](https://github.com/phil294/coffeesense/commit/d5418245) Add completion inside `"#{template.literals}"`
- [`b170b9fd`](https://github.com/phil294/coffeesense/commit/b170b9fd) Remove document symbols. They were not in a usable state, and with next update, no symbols (outline) is better than broken outline, so sticky scroll still works [fine](https://github.com/microsoft/vscode/issues/157165)
- [`327deae6`](https://github.com/phil294/coffeesense/commit/327deae6) Fix / work around `strictNullChecks: true` (when active) inside comprehensions over arrays, e.g. `x.prop for x in y` gave errors, because this becomes a for-loop, and `x` is in the next line defined as `y[i]`, which a strict TS may not like. This change adds a type guard for `x` before continuing.

#### 1.12.0
##### 2022-05-27
- [`d2ee9b05`](https://github.com/phil294/coffeesense/commit/d2ee9b05) Fix server crash in case of jsdoc-only/-intern errors
- [`2b3b9aa4`](https://github.com/phil294/coffeesense/commit/2b3b9aa4) Add support for IntelliSense JSDoc comment blocks such as type go tos. Both multiline block and inline parameter types should work fine. As the CoffeeScript compiler (understandably) does not emit source maps for comments, these mappings are now done by CS/JS line content (near) equivalence matching. This works fine in most cases, but can obviously go wrong in a multitude of ways, for example if a line is not unique across the document. Another caveat for go tos from from other files: Opening of the respective target file should always work, but exact position only works when it was open/loaded beforehand (should be fixable some day)

#### 1.11.0
##### 2022-05-22
- [`6cc76e45`](https://github.com/phil294/coffeesense/commit/6cc76e45) Fix autocomplete for inline object keys in more specialized conditions such as inline after other key-values
- [`6cc76e45`](https://github.com/phil294/coffeesense/commit/6cc76e45) Internal trailing space transforms revise: Trailing spaces are now *possible* but mostly yield type errors, so it's best to keep avoiding them.
- [`8676ec03`](https://github.com/phil294/coffeesense/commit/8676ec03) Add improved autocomplete when the document contains multiple unclosed braces `{`
- [`8676ec03`](https://github.com/phil294/coffeesense/commit/8676ec03) Add internal pseudo-compilation step which potentially improves autocomplete in many cases where there are multiple failing points in the source code
- [`07662ebb`](https://github.com/phil294/coffeesense/commit/07662ebb) Fix sometimes wrong autocomplete after trailing dot in indented scenarios
- [`d02fddf6`](https://github.com/phil294/coffeesense/commit/d02fddf6) Fix completion after dot after closing brace )
- [`f870c2ca`](https://github.com/phil294/coffeesense/commit/f870c2ca) Upgrade TS 4.7 from beta to RC

#### 1.10.2
##### 2022-05-03
- Fix invalid range creation error, sometimes even resulting in the entire server to continuously crash

#### 1.10.1
##### 2022-04-29
- Fix type of standalone `@` while preserving autocomplete (no extra `.valueOf()` added - thanks to @STRd6) (#13, #2)

#### 1.10.0
##### 2022-04-26
- Add autocomplete in optional chaining, e.g. `a?.|`
- Fix params and autocomplete after unclosed brace when indented, e.g. `\t### (...) ###\n\tmy_func("|\n\t# x`
- Fix autocomplete after dot in implicit return, e.g. `do =>\n\ta b.|`
- Improve automatic type detection at variable assignment time (again), see #1, 1.2.0, 1.4.0
- Readme: Add new known problem: trailing dot/space in JSDoc

#### 1.9.0
##### 2022-04-21
- Allow importing relative coffee imports without specifying file extension (#12)
- Upgrade TypeScript from 4.6 to 4.7-beta

#### 1.8.1
##### 2022-03-24
- Fix allowing multiline comments. coffeescript allows them, even with normal quotes `"\n\n\n"`
- Fix: In inline object value string completions, prefer object key suggestions to scope variable completions

#### 1.8.0
##### 2022-03-24
- LSP protocol: Support `rootUri` besides `rootPath`
- Prevent transforms to comments: Resulted sometimes e.g. in type errors when a JSDoc comment block line had a trailing space
- Add autocomplete for inline fun param object keys, e.g. `a |` or `a b, |` will now correctly show fields of a possible first or second object argument to `a`, respectively. Example:
    ```coffeescript
    obj = {}
    window.scrollTo |
    ```
    Will now suggest `left`, `top` and `behavior` (additionally to the usual local and global suggestions such as `obj`, imports, global vars etc.)
    These new completions only pop up when you haven't typed anything though, so `behav` would *not* autocomplete to `behavior` and probably never will.
- Add autocompletion for open strings as inline object value, e.g. `window.scrollTo behavior: "|` will now suggest `smooth` and `auto`, even without the closing quote.

#### 1.7.0
##### 2022-03-20
- Add autocomplete inside imports after comma, e.g. `import { a, | } from '...'`
- Add autocomplete to add another import module inside existing import line directly after opening brace, e.g. `import {| a } from '...'`
- Fix import module name: global vars such as DOM objects where falsely suggested in e.g. `import {|} from 'some-lib'`
- Add autocomplete after open (not yet closed) quote, e.g. `a = "|`
- Add autocomplete after dot before comment on same line, e.g. `b.| # abc`
- Fixing completion inserts that modify text to the left of the cursor. Known use cases:
  - Add object key autocompletion with space/special chars in name, e.g. completes `a.|` to `a["the completion"]`
  - Add question after array element if it is strictly optional because of noUncheckedIndexedAccess:true, e.g. completes `[0].` to `[0]?.theCompletion`
- Auto-import: when import mapping failed, only insert at pos 0/0 if it actually starts with `import `, as it's otherwise garbage
- Auto-import: when range mapping failed and line does not start with import, try to find identical line in cs and insert there if found (#10)
- When autocompleting a word, only suggest completions that actually contain that very word (already worked in VSCode)
- Fix edge case of autocomplete inside object property on a selfcontained key-value line that does *not* end with `.` but is invalid anyways *and* whose key is defined with brackets syntax because of spaces etc
- Small Readme improvements

#### 1.6.0
##### 2022-03-10
- Add autocomplete after `()` inside implicit braces (`console.log new Date().to|`)
- Add autocomplete in inline callbacks, in assignment object dot access, and in some cases with special keywords unless, not, and, is, isnt, then
- Add autocomplete on lines ending with dot `.` that also include block related characters like braces (e.g. ...`\n].some (a) => a.|`)
- Add autocomplete in special case of FP: `[]\n.|\n.x => 1`
- Add autocomplete in special case: Outside of object if line contains a colon, `x = [{a: 1}].|`
- Yet another revision of internal logic regarding autocompletion on erroneous coffee lines, with more edge cases working out of the box

#### 1.5.0
##### 2022-03-05
- Upgrade all dependencies, most notably TypeScript 4.3 -> 4.6
- CoffeeScript was updated from 2.5 to 2.6 in previous update 1.4.0, forgot to add this to the changelog
- Some fixes were merged from upstream (Vetur): "Fix corner case when same monorepo folder start with.", "Fix load project too slow.", "Fix `property 'flags' of undefined`.", and "Add editor sdk setup notes to Yarn PnP section"

#### 1.4.1
##### 2022-03-01
- Fix syntax error at regular object shorthand field (`a = {\n  b\n}`)

#### 1.4.0
##### 2022-02-28
- Improve object autocomplete and internals. Several small internal changes and improvements regarding objects
- Add support for go tos in basic comprehensions. Go Tos now in general try to find the nearest previous variable assignment of the word the cursor is under, if no match could be found by asking tsserver. This is a primitive fallback method and can sometimes pont to wrong lines but works in most scenarios.
- Fix error of different autocomplete results for subsequent requests
- Enable autocomplete while building a brace syntax object, without having a valid closing brace yet
- Improve/fix autocomplete for strings and imports, now also completes partial strings
- Add autocomplete inside empty import values braces `import {|} from ...`
- Revert `1.2.0` change (variable assignment detection logic change), as it does not yet handle comment blocks appropriately and messes up JSDoc sometimes
- Upgrade CoffeeScript from 2.5 to 2.6 ([Changelog](https://github.com/jashkenas/coffeescript/pull/5374))
- Fix wrong completion text at `@|` (resolved falsely to `@this.theCompletionText`)
- Add autocomplete for local import path completion
- Internal: Added automatic tests for all known features of this extension

#### 1.3.0
##### 2022-02-25
- Allow configuring additional file extensions other than `.coffee` using VSCode's setting `files.associations` or `coffeesense.fileExtensions` for other IDEs. (#9)
- Fix syntax check for lines ending on an open brace `(` (#8)
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
- Add autocomplete in if-statements etc. if next line is indented
- Fix signature help after dangling opening brace in some cases
- Add Readme note about VSCode `trimAutoWhitespace` problems

#### 1.1.10
##### 2022-01-08
- Add autocomplete in rare cases after dot (test case: `=>\n\twindow.|\n\tx = 1`)

#### 1.1.9
##### 2022-01-08
- Add syntax around empty yet indented lines under certain circumstances: `\t\n\t\tsomething` failed useful compilation because of the increasing indentation
- Fix (?) autocompletion inside objects while current line is invalid (while typing)

#### 1.1.8
##### 2022-01-06
- Add autocomplete after dot in otherwise empty line, e.g. `abc\n.|`

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
- Add autocomplete after dot `.` when next line is a comment
- Add autocompleting object properties in non-empty lines

#### 1.1.3
##### 2021-11-16
- Add GoTo when variable name contains dollar sign `$`

#### 1.1.2
##### 2021-10-14
- Fix wrong TS version under specific conditions with `useWorkspaceDependencies: true`

#### 1.1.1
##### 2021-10-01
- Internally compile object methods (`{ foo: -> }`) via [object method definition shorthand](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Method_definitions) (`{ foo() {} }`) instead of normal CS compiler output (`{ foo: function() {} }`). This should not affect the logic at all, but it fixes TS typing in Vue.js object notation files, for some reason.

#### 1.1.0
##### 2021-09-05
- Add autocompletion at `@|`

#### 1.0.0
##### 2021-09-04
