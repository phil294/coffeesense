# Syntax Highlighting

CoffeeSense supports syntax highlighting for the following languages:

| syntax                   | lang      | required extension                                                                                                                                                 |
| ------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `<template>`             | `html`    |
| `<template lang="pug">`  | `pug`     |
| `<template lang="jade">` | `pug`     |
| `<template lang="haml">` | `haml`    | [Better Haml](https://marketplace.visualstudio.com/items?itemName=karunamurti.haml) or [Ruby Haml](https://marketplace.visualstudio.com/items?itemName=vayan.haml) |
| `<template lang="slm">`  | `slm`     | [Slm Syntax](https://marketplace.visualstudio.com/items?itemName=mrmlnc.vscode-slm)                                                                                |
| `<template lang="slim">` | `slim`    | [Slim](https://marketplace.visualstudio.com/items?itemName=sianglim.slim)                                                                                          |
| `<style>`                | `css`     |
| `<style lang="postcss">` | `postcss` |
| `<style lang="scss">`    | `scss`    |
| `<style lang="sass">`    | `sass`    | [Sass](https://marketplace.visualstudio.com/items?itemName=Syler.sass-indented)                                                                             |
| `<style lang="less">`    | `less`    |
| `<style lang="stylus">`  | `stylus`  | [language-stylus](https://marketplace.visualstudio.com/items?itemName=sysoev.language-stylus)
| `<style lang="sss">`     | `sss`     |                                                           |
| `<script>`               | `js`      |
| `<script lang="ts">`     | `ts`      |
| `<script lang="coffee">` | `coffee`  |

::: v-pre
CoffeeSense supports syntax highlighting for vue directives (e.g. `v-if` or `:attribute=`) and vue interpolations (e.g. `{{variable}}`).
:::
The supported attribute string literals are `'` and `"`.
CoffeeSense does not support the `` ` `` backtick literal, as it makes things more complex and there is no observed benefit of using it.

CoffeeSense does not support explicitly adding the default language:

```vue
<template lang="html"></template>

<style lang="css"></style>

<script lang="js"></script>
<script lang="javascript"></script>
```

Preprocessors are also not languages, so `<script lang="babel">` would be invalid as well.

## Custom Block

CoffeeSense provides a setting `coffeesense.grammar.customBlocks` that defaults to:

```json
  "coffeesense.grammar.customBlocks": {
    "docs": "md",
    "i18n": "json"
  }
```

You can

- Change `coffeesense.grammar.customBlocks`, for example:

  ```json
  "coffeesense.grammar.customBlocks": {
    "docs": "md",
    "i18n": "json",
    "page-query": "graphql",
    "static-query": "graphql"
  }
  ```

- Run the command "CoffeeSense: Generate grammar from `coffeesense.grammar.customBlocks`
- **Restart VS Code** to get syntax highlighting for custom blocks.

Valid language value for custom blocks:

- All `lang` values in the support table.
- `md | yaml | json | php | graphql`

