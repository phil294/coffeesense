import { parseCoffeescriptScript } from './preprocess';
import type ts from 'typescript';
import { isVirtualCoffeescriptFile } from './util';
import { RuntimeLibrary } from '../dependencyService';
import { EnvironmentService } from '../EnvironmentService';

export function getCoffeescriptSys(tsModule: RuntimeLibrary['typescript'], scriptFileNameSet: Set<string>, env: EnvironmentService) {
  /**
   * This part is only accessed by TS module resolution
   */
  const coffeescriptSys: ts.System = {
    ...tsModule.sys,
    fileExists(path: string) {
      if (isVirtualCoffeescriptFile(path, scriptFileNameSet, env)) {
        return tsModule.sys.fileExists(path.slice(0, -'.ts'.length));
      }
      return tsModule.sys.fileExists(path);
    },
    readFile(path, encoding) {
      if (isVirtualCoffeescriptFile(path, scriptFileNameSet, env)) {
        const fileText = tsModule.sys.readFile(path.slice(0, -'.ts'.length), encoding);
        return fileText ? parseCoffeescriptScript(fileText) : fileText;
      }
      const fileText = tsModule.sys.readFile(path, encoding);
      return fileText;
    }
  };

  if (tsModule.sys.realpath) {
    const realpath = tsModule.sys.realpath;
    coffeescriptSys.realpath = function (path) {
      if (isVirtualCoffeescriptFile(path, scriptFileNameSet, env)) {
        return realpath(path.slice(0, -'.ts'.length)) + '.ts';
      }
      return realpath(path);
    };
  }

  return coffeescriptSys;
}
