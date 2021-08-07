# FAQ

## Install an old version of CoffeeSense

Sometimes new releases have bugs that you want to avoid. Here's an easy way to downgrade CoffeeSense to a working version:

- Set `"extensions.autoUpdate": false`.
- Find the version you want and download VSIX https://github.com/phil294/coffeesense/blob/master/CHANGELOG.md.
- Install VSIX following this guide: https://code.visualstudio.com/docs/editor/extension-gallery#_install-from-a-vsix.

## No Syntax Highlighting & No Language Features working

The two possible causes are:

1. Other extensions also contribute a Vue language, and that conflicts with CoffeeSense.
2. VS Code didn't install CoffeeSense properly.

For 1, try disabling all other Vue related extensions.

For 2, try these methods:

- Run command: `Developer: Reinstall Extension` for CoffeeSense.
- Remove CoffeeSense in your [extensions folder](https://code.visualstudio.com/docs/editor/extension-gallery#_common-questions) and do a clean reinstall.
- (Windows): Try removing & reinstall CoffeeSense with admin privilege.
- If nothing above works, download the [latest pre-packaged vsix file](https://github.com/phil294/coffeesense/releases) and [install through vsix](https://code.visualstudio.com/docs/editor/extension-gallery#_install-from-a-vsix).

## CoffeeSense Crash

- If it says `cannot find module <some-module>`, go to CoffeeSense's client code installation directory and run `yarn` or `npm install`.
  This is usually caused by VS Code not correctly updating CoffeeSense's dependencies from version to version.
  Paths:
  - Win: `%USERPROFILE%\.vscode\extensions\octref.coffeesense-<version>\client`
  - Mac: `~/.vscode/extensions/octref.coffeesense-<version>/client`
  - Linux: `~/.vscode/extensions/octref.coffeesense-<version>/client`

  You can also try uninstall/reinstall CoffeeSense.  
  More details at: https://github.com/phil294/coffeesense/issues/352#issuecomment-318168811

- If it says problem related to memory and cpu, try to add a `jsconfig.json` or `tsconfig.json` and only include Vue-related code: https://vuejs.github.io/coffeesense/setup.html

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

## `Property 'xxx' does not exist on type 'CombinedVueInstance'`

If you are getting a lot of `Property 'xxx' does not exist on type 'CombinedVueInstance'` errors, it's an issue with Vue's typing and TypeScript.

Related issues: [vuejs/vue#8721](https://github.com/vuejs/vue/issues/8721), [vuejs/vue#9873](https://github.com/vuejs/vue/issues/9873) and [microsoft/TypeScript#30854](https://github.com/microsoft/TypeScript/issues/30854).

You can work around it by:

- Annotating return type for each computed property, by either [adding JSDoc](https://github.com/phil294/coffeesense/issues/1707#issuecomment-686851677) or [TS types](https://vuejs.org/v2/guide/typescript.html#Annotating-Return-Types).
- Setting `coffeesense.validation.interpolation: false`. You'll not get any template error checking.
- Downgrading TS to a version before 3.4 and enabling `coffeesense.useWorkspaceDependencies`. You'll not get support for new TS syntaxes, such as optional chaining.
- Use [Composition API](https://composition-api.vuejs.org).

## Template Interpolation auto completion does not work

You are running into the same issue as above — not typing return type of `computed`. Please add [JSDoc](https://github.com/phil294/coffeesense/issues/1707#issuecomment-686851677) or [TS types](https://vuejs.org/v2/guide/typescript.html#Annotating-Return-Types) for computed properties.

## CoffeeSense cannot recognize my Vue component import, such as `import Comp from './comp'`

- You need to add `.vue` extension when importing SFC.

More details at: https://github.com/phil294/coffeesense/issues/423#issuecomment-340235722

## .vue file cannot be imported in TS file

You need to add `declare module '*.vue'` in your dts files: https://github.com/Microsoft/TypeScript-Vue-Starter#single-file-components.

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

## CoffeeSense uses different version of TypeScript in .vue files to what I installed in `node_modules`.

You can enable the `CoffeeSense: Use Workspace Dependencies` setting so that CoffeeSense uses the same version of TypeScript in your workspace.
NB: It will use `typescript.tsdk` setting as the path to look for if defined, defaulting to `node_modules/typescript`. This enables tools like Yarn PnP to set their own custom resolver.

## CoffeeSense is slow

You can run the command `CoffeeSense: Restart VLS (Vue Language Server)` to restart VLS.

However, we'd appreciate it if you can file a [performance issue report with a profile](https://github.com/phil294/coffeesense/blob/master/.github/PERF_ISSUE.md) to help us find the cause of the issue.

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

If you don't have any `package.json` in your project, CoffeeSense can't know the Vue version and component data from other libs.
CoffeeSense assumes that the version of Vue is less than 2.5.
If the version is wrong, you will get wrong diagnostics from typescript and eslint template validation.

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

