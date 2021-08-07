# VTI

🚧 WIP. This feature is not stable yet. 🚧

VTI (CoffeeSense Terminal Interface) is a CLI that exposes some of CoffeeSense's language features:

- [x] Diagnostic errors
- [ ] Formatting

## Why

VTI catches type-errors in Vue templates that's not catchable by either Vue or TypeScript alone.

- Vue compiler: do not understand types.
- TypeScript compiler: do not understand Vue templates.
- VLS: Understand both to do [TS type-checking on Vue templates](https://vuejs.github.io/coffeesense/guide/interpolation.html).
- VTI: Surfaces VLS's errors on CLI for CI.

## Usage

```bash
npm i -g vti
# or yarn global add vti
# run this in the root of a Vue project
vti
vti diagnostics
```

![VTI demo](https://user-images.githubusercontent.com/4033249/72225084-911ef580-3581-11ea-9943-e7165126ace9.gif).

You also can use [`coffeesense.config.js`](/reference/) for setting VTI.

Currently, this is only used for generating interpolation type-checking errors on CLI, which
neither Vue's compiler nor Webpack would catch.

Please send feedback to: https://github.com/phil294/coffeesense/issues/1635.
