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

## Multi-root
If you use monorepo or VTI or `package.json` and `tsconfig.json/jsconfig.json` do not exist at project root, you can use `coffeesense.config.js` for advanced setting.

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
*Untested - this section originates from upstream repo*
CoffeeSense supports this feature now, but has some limits.

- Don't mix common project and pnp project in multi-root/monorepo
- Prettier doesn't support Yarn PnP, so can't load plugin automatically.
