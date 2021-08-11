const { getRootPath, clearDist, external, onwarn, createPlugins } = require('../build/rollup-common-config');
const {
  linkLspInCLI,
  bundleLspWithEsbuild,
  watchLspChange,
  generateTypingsLsp
} = require('../build/rollup-plugins.js');
const lspPkg = require('./package.json');
const dts = require('rollup-plugin-dts').default;

const getLSPPath = getRootPath('server');

clearDist(getLSPPath('dist'));

module.exports = [
  // coffeescriptServerMain
  {
    input: getLSPPath('src/coffeescriptServerMain.ts'),
    output: { file: getLSPPath('dist/coffeescriptServerMain.js'), name: lspPkg.name, format: 'cjs', sourcemap: true },
    external,
    onwarn,
    watch: {
      include: getLSPPath('**')
    },
    plugins: [
      watchLspChange(),
      generateTypingsLsp(),
      bundleLspWithEsbuild(),
      linkLspInCLI(),
      ...createPlugins(getLSPPath('tsconfig.json'))
    ]
  },
  // bundle typings
  {
    input: getLSPPath('typings/main.d.ts'),
    output: {
      file: getLSPPath('dist/lsp.d.ts'),
      format: 'es'
    },
    onwarn,
    plugins: [dts()]
  }
];
