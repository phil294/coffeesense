# Snippet

CoffeeSense lets you use snippets for each embedded languages.

For example, snippet defined for TypeScript will be available in the TypeScript region:
```html
<script lang="ts">
  // Use TS snippets here
</script>
```

Two exceptions:
- Use snippets for `vue-html` inside `<template></template>`
- Use `vue` snippets outside all regions

```html
<template>
  <!-- Use `vue-html` snippets here -->
</template>
<!-- Use `vue` snippets here -->
<style>
</style>
```

## Customizable Scaffold Snippets

CoffeeSense provides scaffolding snippets for quickly defining regions.  
They are `vue` snippets and can be used outside language regions.

To start using them, type:

- `<vue` for file scaffolding snippets
- `<template` for template scaffolding snippets
- `<style` for style scaffolding snippets
- `<script` for script scaffolding snippets

Three sources supplement CoffeeSense with scaffold snippets:

![Snippet Main](../images/snippet-main.png)

- 💼 Workspace. Located at `<WORKSPACE>/.vscode/coffeesense/snippets`. These scaffold snippets are only available in the workspace.
- 🗒️ User data directory. You can open the folder with the command `CoffeeSense: Open user scaffold snippet folder`. These scaffold snippets are available in all workspaces.
- ✌ CoffeeSense. CoffeeSense offers a few scaffold snippets out of the box.

The workspace/user CoffeeSense snippet folders share the same structure:

```
coffeesense/snippets/
├── docs/
│   │   // Completed as `<docs>`. Will have default completion icon.
│   └── docs.vue
├── style/
│   │   // Completed as `<style>`. Will have CSS completion icon.
│   │   // `template` and `script` folder will have HTML/JS icons.
│   └── scss-module.vue 
└── vue-class-component.vue // Top level files will be completed as `<vue>`
```

Completions of scaffold snippets are sorted by their categories. Workspace > User > CoffeeSense.

You can customize the suffix and turn sources on/off with `coffeesense.completion.scaffoldSnippetSources`:

```json
"coffeesense.completion.scaffoldSnippetSources": {
  "workspace": "💼", // Suffix workspace snippets with `💼`
  "user": "(️User)", // Suffix workspace snippets with `(User)`
  "coffeesense": "" // Disable CoffeeSense's builtin scaffold snippets
}
```

![Snippet Partial](../images/snippet-partial.png)

#### Snippet Syntax

You can use everything that's allowed in [VS Code Snippet Syntax](https://code.visualstudio.com/docs/editor/userdefinedsnippets). The good thing is, you write them in `.vue` files instead of `.json` files, and you don't need to escape special characters.
