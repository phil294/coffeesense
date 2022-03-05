# Setup

## File extensions
To get full support for CoffeeScript for files with an extension other than `.coffee`, you can use VSCode's file association feature. For example, to add `.coffee2` files:
```jsonc
// settings.json
{
  // ...
  "files.associations": {
    "*.coffee2": "coffeescript"
  }
}
```
More sophisticated glob patterns other than exactly `"*.some-extension"` are not supported.

If you are using another IDE where this setting does not exist, you can instead specify custom file extensions via hidden setting in `coffeesense.config.js` (see below):
```js
// coffeesense.config.js
module.exports = {
  settings: {
    "coffeesense.fileExtensions": [ "coffee2" ]
  }
}
```

## Multi-root
If you use a monorepo, VTI or `package.json` and `tsconfig.json/jsconfig.json` does not exist at project root, you can use `coffeesense.config.js` for advanced settings.

Please add `coffeesense.config.js` at project root or monorepo project root.
```javascript
// coffeesense.config.js
module.exports = {
  // **optional** default: `{}`
  // override vscode settings
  // Notice: It only affects the settings used by CoffeeSense.
  settings: {
    "coffeesense.useWorkspaceDependencies": true,
  },
  // **optional** default: `[{ root: './' }]`
  // support monorepos
  projects: [
    './packages/repo2', // Shorthand for specifying only the project root location
    {
      // **required**
      // Where is your project?
      // It is relative to `coffeesense.config.js`.
      root: './packages/repo1',
      // **optional** default: `'package.json'`
      // Where is `package.json` in the project?
      // It is relative to root property.
      package: './package.json',
      // **optional**
      // Where is TypeScript config file in the project?
      // It is relative to root property.
      tsconfig: './tsconfig.json'
    }
  ]
}
```

## Yarn PnP
*Untested - everything below originates from upstream repo:*

This feature is supported, but it has some limits.

- Don't mix common project and pnp project in multi-root/monorepo
- Prettier doesn't support Yarn PnP, so we can't load plugin automatically.

If you're using the editor SDKs ([Yarn Editor SDKs](https://yarnpkg.com/getting-started/editor-sdks)) with typescript and you want to use the typescript server wrapper created by yarn you'll need to set the `typescript.tsdk` to the directory of the editor sdk's tsserver:
```javascript
const path = require('path')

// vetur.config.js
/** @type {import('vls').VeturConfig} */
module.exports = {
  // **optional** default: `{}`
  settings: {
    "vetur.useWorkspaceDependencies": true,
    "typescript.tsdk": path.resolve(__dirname, '.yarn/sdks/typescript/bin'),
  },
}
```
