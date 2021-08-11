# FAQ

## CoffeeSense can't recognize components imported using webpack's alias

- You need to setup path mapping in `jsconfig.json` or `tsconfig.json`: https://www.typescriptlang.org/docs/handbook/module-resolution.html. For example:

  ```js
  // Webpack
  module.exports = {
    resolve: {
      alias: {
        '@': 'src'
      }
    }
  }
  ```

  ```json
  // tsconfig.json
  {
    "compilerOptions": {
      "baseUrl": ".",
      "paths": {
        "@/*": [
          "src/*"
        ]
      }
    }
  }
  ```

## How to build and install from source

To build and install the extension from source, you need to install [`vsce`](https://code.visualstudio.com/docs/extensions/publish-extension).

Then, clone the repository and compile it.

```
git clone https://github.com/phil294/coffeesense
cd coffeesense
yarn
yarn compile
vsce package
```
  
Now you'll find `coffeesense-{version}.vsix`, you can install it by editor command "Install from VSIX".

## CoffeeSense is slow

You can run the command `CoffeeSense: Restart LSP (CoffeeSense Language Server)` to restart LSP.

Profiling via `coffeesense.dev.lspPort` should be possible, check out https://github.com/vuejs/vetur/blob/master/.github/PERF_ISSUE.md

Maybe it is working through your entire `node_modules`. If so, exclude it via tsconfig / jsconfig.

## CoffeeSense can't find `tsconfig.json`, `jsconfig.json` in /xxxx/xxxxxx.

If you don't have any `tsconfig.json`, `jsconfig.json` in your project,
CoffeeSense will use fallback settings. Some features such as including path alias, decorator, and import json won't work.

You can add this config in correct position in your project or use `coffeesense.config.js` to set the file path.

- [Read more project setup](/guide/setup.md#project-setup)
- [Read more `coffeesense.config.js`](/guide/setup.md#advanced)

If you want debug info, you can use `CoffeeSense: show doctor info` command.   
You can use `coffeesense.ignoreProjectWarning: true` in vscode setting to close this warning.

⚠️ Notice ⚠️ : If you don't need (path alias/decorator/import json) feature, you can just close it.

## CoffeeSense can't find `package.json` in /xxxx/xxxxxx.

If the version is wrong, the setting `useWorkspaceDependencies` cannot be used.

You can add this config at the correct position in your project or use `coffeesense.config.js` to set file path.

- [Read more `coffeesense.config.js`](/guide/setup.md#advanced)

If you want debug info, you can use `CoffeeSense: show doctor info` command.   
You can use `coffeesense.ignoreProjectWarning: true` in vscode setting to close this warning.

## CoffeeSense found xxx, but they aren\'t in the project root.
CoffeeSense found the file, but it may not actually be what you want.
If it is wrong, it will cause same result as the previous two. [ref1](/guide/FAQ.md#coffeesense-can-t-find-tsconfig-json-jsconfig-json-in-xxxx-xxxxxx), [ref2](/guide/FAQ.md#coffeesense-can-t-find-package-json-in-xxxx-xxxxxx)

You can add this config at the correct position in your project or use `coffeesense.config.js` to set file path.

- [Read more `coffeesense.config.js`](/guide/setup.md#advanced)

If you want debugging info, you can use the `CoffeeSense: show doctor info` command.   
You can use `coffeesense.ignoreProjectWarning: true` in vscode settings to close this warning.

