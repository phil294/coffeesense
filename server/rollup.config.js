const fs = require('fs-extra');
const path = require('path');
const fg = require('fast-glob');
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
  // vueServerMain
  {
    input: getLSPPath('src/vueServerMain.ts'),
    output: { file: getLSPPath('dist/vueServerMain.js'), name: lspPkg.name, format: 'cjs', sourcemap: true },
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
