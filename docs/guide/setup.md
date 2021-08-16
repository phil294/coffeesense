# Setup

The following VSCode extension options are available. The default values are set.

```json
{
  // Some TypeScript errors don't make a lot of sense in CS context (see main README), you can ignore them here by supplying their IDs.
  // Some error code suggestions you might want to add here:
  // 7030: Not all code paths return a value
  "coffeesense.ignoredTypescriptErrorCodes": [],
  // CoffeeSense will warn about not setup correctly for the project. You can disable it.
  "coffeesense.ignoreProjectWarning": false,
  // Use dependencies from workspace. Currently only for TypeScript. (not sure if this works)
  "coffeesense.useWorkspaceDependencies": false,
  // Traces the communication between VS Code and CoffeeSense Language Server.
  "coffeesense.trace.server": "off", // Possible values: "off", "messages", "verbose"
  // Path to lsp for CoffeeSense developers. There are two ways of using it.   
  // 1. Clone phil294/coffeesense from GitHub, build it and point it to the ABSOLUTE path of `/server`.
  // 2. `yarn global add coffeesense-language-server` and point CoffeeSense to the installed location (`yarn global dir` + node_modules/coffeesense-language-server)
  "coffeesense.dev.lspPath": null,
  // The port that the lsp listens to. Can be used for attaching to the LSP Node process for debugging / profiling.
  "coffeesense.dev.lspPort": null,
  // Log level for the lsp"
  "coffeesense.dev.logLevel": "INFO" // Possible values: "INFO", "DEBUG"
}
```

## Advanced
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
