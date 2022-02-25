import type ts from 'typescript';
import { URI } from 'vscode-uri';
import { TextDocument } from 'vscode-languageserver-textdocument';
import parseGitIgnore from 'parse-gitignore';

import { LanguageModelCache } from '../../embeddedSupport/languageModelCache';
import { parseCoffeescriptScript } from './preprocess';
import { getFileFsPath, getFilePath, normalizeFileNameToFsPath } from '../../utils/paths';
import { getCoffeescriptSys } from './coffeescriptSys';
import { isCoffeescriptFile } from './util';
import { logger } from '../../log';
import { ModuleResolutionCache } from './moduleResolutionCache';
import { RuntimeLibrary } from '../dependencyService';
import { EnvironmentService } from '../EnvironmentService';
import { dirname } from 'path';
import { LANGUAGE_ID } from '../../language';

const NEWLINE = process.platform === 'win32' ? '\r\n' : '\n';

function getDefaultCompilerOptions(tsModule: RuntimeLibrary['typescript']) {
  const defaultCompilerOptions: ts.CompilerOptions = {
    allowNonTsExtensions: true,
    allowJs: true,
    lib: ['lib.dom.d.ts', 'lib.es2017.d.ts'],
    target: tsModule.ScriptTarget.Latest,
    moduleResolution: tsModule.ModuleResolutionKind.NodeJs,
    module: tsModule.ModuleKind.CommonJS,
    jsx: tsModule.JsxEmit.Preserve,
    allowSyntheticDefaultImports: true,
    experimentalDecorators: true
  };

  return defaultCompilerOptions;
}

export interface IServiceHost {
  updateCurrentCoffeescriptTextDocument(doc: TextDocument): {
    service: ts.LanguageService;
    scriptDoc: TextDocument;
  };
  getLanguageService(): ts.LanguageService;
  updateExternalDocument(filePath: string): void;
  getFileNames(): string[];
  getComplierOptions(): ts.CompilerOptions;
  dispose(): void;
}

/**
 * Manges 4 set of files
 *
 * - `LANGUAGE_ID` files in workspace
 * - `js/ts` files in workspace
 * - `LANGUAGE_ID` files in `node_modules`
 * - `js/ts` files in `node_modules`
 */
export function getServiceHost(
  tsModule: RuntimeLibrary['typescript'],
  env: EnvironmentService,
  updatedScriptRegionDocuments: LanguageModelCache<TextDocument>
): IServiceHost {
  let currentScriptDoc: TextDocument;

  let projectVersion = 1;
  let versions = new Map<string, number>();
  let localScriptRegionDocuments = new Map<string, TextDocument>();
  let nodeModuleSnapshots = new Map<string, ts.IScriptSnapshot>();
  let projectFileSnapshots = new Map<string, ts.IScriptSnapshot>();
  let moduleResolutionCache = new ModuleResolutionCache();

  let parsedConfig: ts.ParsedCommandLine;
  let scriptFileNameSet: Set<string>;

  let coffeescriptSys: ts.System;
  let compilerOptions: ts.CompilerOptions;

  let jsHost: ts.LanguageServiceHost;

  let registry: ts.DocumentRegistry;
  let jsLanguageService: ts.LanguageService;
  init();

  function getCompilerOptions() {
    const compilerOptions = {
      ...getDefaultCompilerOptions(tsModule),
      ...parsedConfig.options
    };
    compilerOptions.allowNonTsExtensions = true;
    return compilerOptions;
  }

  function init() {
    projectVersion = 1;
    versions = new Map<string, number>();
    localScriptRegionDocuments = new Map<string, TextDocument>();
    nodeModuleSnapshots = new Map<string, ts.IScriptSnapshot>();
    projectFileSnapshots = new Map<string, ts.IScriptSnapshot>();
    moduleResolutionCache = new ModuleResolutionCache();

    parsedConfig = getParsedConfig(tsModule, env.getProjectRoot(), env.getTsConfigPath(), env.get_file_extensions());
    const initialProjectFiles = parsedConfig.fileNames;
    logger.logDebug(
      `Initializing ServiceHost with ${initialProjectFiles.length} files: ${JSON.stringify(initialProjectFiles)}`
    );
    scriptFileNameSet = new Set(initialProjectFiles);
    coffeescriptSys = getCoffeescriptSys(tsModule, scriptFileNameSet, env);
    compilerOptions = getCompilerOptions();

    jsHost = createLanguageServiceHost(compilerOptions);
    registry = tsModule.createDocumentRegistry(true);
    jsLanguageService = tsModule.createLanguageService(jsHost, registry);
  }

  function updateCurrentCoffeescriptTextDocument(doc: TextDocument) {
    const fileFsPath = getFileFsPath(doc.uri);
    const filePath = getFilePath(doc.uri);
    // When file is not in language service, add it
    if (!localScriptRegionDocuments.has(fileFsPath)) {
      if (env.get_file_extensions().some(ext => fileFsPath.endsWith(`.${ext}`))) {
        scriptFileNameSet.add(filePath);
      }
    }

    if (!currentScriptDoc || doc.uri !== currentScriptDoc.uri || doc.version !== currentScriptDoc.version) {
      currentScriptDoc = updatedScriptRegionDocuments.refreshAndGet(doc)!;
      const localLastDoc = localScriptRegionDocuments.get(fileFsPath);
      if (localLastDoc && currentScriptDoc.languageId !== localLastDoc.languageId) {
        // if languageId changed, restart the language service; it can't handle file type changes
        jsLanguageService.dispose();
        jsLanguageService = tsModule.createLanguageService(jsHost);
      }
      localScriptRegionDocuments.set(fileFsPath, currentScriptDoc);
      scriptFileNameSet.add(filePath);
      versions.set(fileFsPath, (versions.get(fileFsPath) || 0) + 1);
      projectVersion++;
    }
    return {
      service: jsLanguageService,
      scriptDoc: currentScriptDoc
    };
  }

  // External Documents: JS/TS, non Coffeescript documents
  function updateExternalDocument(fileFsPath: string) {
    // reloaded `tsconfig.json`
    if (fileFsPath === env.getTsConfigPath()) {
      logger.logInfo(`refresh ts language service when ${fileFsPath} changed.`);
      init();
      return;
    }

    // respect tsconfig
    // use *internal* function
    const configFileSpecs = (parsedConfig as any).configFileSpecs;
    const isExcludedFile = (tsModule as any).isExcludedFile;
    if (
      isExcludedFile &&
      configFileSpecs &&
      isExcludedFile(fileFsPath, configFileSpecs, env.getProjectRoot(), true, env.getProjectRoot())
    ) {
      return;
    }
    logger.logInfo(`update ${fileFsPath} in ts language service.`);

    const ver = versions.get(fileFsPath) || 0;
    versions.set(fileFsPath, ver + 1);
    projectVersion++;

    // Clear cache so we read the js/ts file from file system again
    if (projectFileSnapshots.has(fileFsPath)) {
      projectFileSnapshots.delete(fileFsPath);
    }
  }

  function getFileNames() {
    return Array.from(scriptFileNameSet);
  }

  function createLanguageServiceHost(options: ts.CompilerOptions): ts.LanguageServiceHost {
    return {
      getProjectVersion: () => projectVersion.toString(),
      getCompilationSettings: () => options,
      getScriptFileNames: () => Array.from(scriptFileNameSet),
      getScriptVersion(fileName) {
        if (fileName.includes('node_modules')) {
          return '0';
        }

        const normalizedFileFsPath = normalizeFileNameToFsPath(fileName);
        const version = versions.get(normalizedFileFsPath);
        return version ? version.toString() : '0';
      },
      getScriptKind(fileName) {
        if (fileName.includes('node_modules')) {
          return (tsModule as any).getScriptKindFromFileName(fileName);
        }

        if (isCoffeescriptFile(fileName, env)) {
          const uri = URI.file(fileName);
          const fileFsPath = normalizeFileNameToFsPath(fileName);
          let doc = localScriptRegionDocuments.get(fileFsPath);
          if (!doc) {
            doc = updatedScriptRegionDocuments.refreshAndGet(
              TextDocument.create(uri.toString(), LANGUAGE_ID, 0, tsModule.sys.readFile(fileName) || '')
            );
            localScriptRegionDocuments.set(fileFsPath, doc);
            scriptFileNameSet.add(fileName);
          }
          return getScriptKind(tsModule, doc.languageId);
        } else {
          // NOTE: Typescript 2.3 should export getScriptKindFromFileName. Then this cast should be removed.
          return (tsModule as any).getScriptKindFromFileName(fileName);
        }
      },

      getDirectories: coffeescriptSys.getDirectories,
      directoryExists: coffeescriptSys.directoryExists,
      fileExists: coffeescriptSys.fileExists,
      readFile: coffeescriptSys.readFile,
      readDirectory(
        path: string,
        extensions?: ReadonlyArray<string>,
        exclude?: ReadonlyArray<string>,
        include?: ReadonlyArray<string>,
        depth?: number
      ): string[] {
        const allExtensions = extensions ? extensions.concat(env.get_file_extensions().map(e => `.${e}`)) : extensions;
        return coffeescriptSys.readDirectory(path, allExtensions, exclude, include, depth);
      },

      resolveModuleNames(moduleNames: string[], containingFile: string): (ts.ResolvedModule | undefined)[] {
        // in the normal case, delegate to ts.resolveModuleName
        // in the relative-imported.LANGUAGE_ID case, manually build a resolved filename
        const result: (ts.ResolvedModule | undefined)[] = moduleNames.map(name => {
          const cachedResolvedModule = moduleResolutionCache.getCache(name, containingFile);
          if (cachedResolvedModule) {
            return cachedResolvedModule;
          }

          if (!isCoffeescriptFile(name, env)) {
            const tsResolvedModule = tsModule.resolveModuleName(
              name,
              containingFile,
              options,
              tsModule.sys
            ).resolvedModule;

            if (tsResolvedModule) {
              moduleResolutionCache.setCache(name, containingFile, tsResolvedModule);
            }

            return tsResolvedModule;
          }

          const tsResolvedModule = tsModule.resolveModuleName(
            name,
            containingFile,
            options,
            coffeescriptSys
          ).resolvedModule;
          if (!tsResolvedModule) {
            return undefined;
          }

          if (env.get_file_extensions().some(ext => tsResolvedModule.resolvedFileName.endsWith(`.${ext}.ts`))) {
            const resolvedFileName = tsResolvedModule.resolvedFileName.slice(0, -'.ts'.length);
            const uri = URI.file(resolvedFileName);
            const resolvedFileFsPath = normalizeFileNameToFsPath(resolvedFileName);
            let doc = localScriptRegionDocuments.get(resolvedFileFsPath);
            // Coffeescript file not created yet
            if (!doc) {
              doc = updatedScriptRegionDocuments.refreshAndGet(
                TextDocument.create(uri.toString(), LANGUAGE_ID, 0, tsModule.sys.readFile(resolvedFileName) || '')
              );
              localScriptRegionDocuments.set(resolvedFileFsPath, doc);
              scriptFileNameSet.add(resolvedFileName);
            }

            const extension = doc.languageId === 'typescript' ? tsModule.Extension.Ts : tsModule.Extension.Js;

            const tsResolvedCoffeescriptModule = { resolvedFileName, extension };
            moduleResolutionCache.setCache(name, containingFile, tsResolvedCoffeescriptModule);
            return tsResolvedCoffeescriptModule;
          } else {
            moduleResolutionCache.setCache(name, containingFile, tsResolvedModule);
            return tsResolvedModule;
          }
        });

        return result;
      },
      getScriptSnapshot: (fileName: string) => {
        if (fileName.includes('node_modules')) {
          if (nodeModuleSnapshots.has(fileName)) {
            return nodeModuleSnapshots.get(fileName);
          }
          const fileText = tsModule.sys.readFile(fileName) || '';
          const snapshot: ts.IScriptSnapshot = {
            getText: (start, end) => fileText.substring(start, end),
            getLength: () => fileText.length,
            getChangeRange: () => void 0
          };
          nodeModuleSnapshots.set(fileName, snapshot);
          return snapshot;
        }

        const fileFsPath = normalizeFileNameToFsPath(fileName);

        // js/ts files in workspace
        if (!isCoffeescriptFile(fileFsPath, env)) {
          if (projectFileSnapshots.has(fileFsPath)) {
            return projectFileSnapshots.get(fileFsPath);
          }
          // Text = content on disk
          const fileText = tsModule.sys.readFile(fileFsPath) || '';
          const snapshot: ts.IScriptSnapshot = {
            getText: (start, end) => fileText.substring(start, end),
            getLength: () => fileText.length,
            getChangeRange: () => void 0
          };
          projectFileSnapshots.set(fileFsPath, snapshot);
          return snapshot;
        }

        // LANGUAGE_ID files in workspace
        const doc = localScriptRegionDocuments.get(fileFsPath);
        let fileText = '';
        if (doc) {
          // Text = content in "virtual" module cache file
          fileText = doc.getText();
        } else {
          // Note: This is required in addition to the parsing in embeddedSupport because
          // this works for .LANGUAGE_ID files that aren't even loaded by VS Code yet.
          const rawCoffeescriptFileText = tsModule.sys.readFile(fileFsPath) || '';
          fileText = parseCoffeescriptScript(rawCoffeescriptFileText);
        }

        return {
          getText: (start, end) => fileText.substring(start, end),
          getLength: () => fileText.length,
          getChangeRange: () => void 0
        };
      },
      getCurrentDirectory: () => env.getProjectRoot(),
      getDefaultLibFileName: tsModule.getDefaultLibFilePath,
      getNewLine: () => NEWLINE,
      useCaseSensitiveFileNames: () => true
    };
  }

  return {
    updateCurrentCoffeescriptTextDocument,
    updateExternalDocument,
    getFileNames,
    getComplierOptions: () => compilerOptions,
    getLanguageService: () => jsLanguageService,
    dispose: () => {
      jsLanguageService.dispose();
    }
  };
}

function defaultIgnorePatterns(tsModule: RuntimeLibrary['typescript'], projectPath: string) {
  const nodeModules = ['node_modules', '**/node_modules/*'];
  const gitignore = tsModule.findConfigFile(projectPath, tsModule.sys.fileExists, '.gitignore');
  if (!gitignore) {
    return nodeModules;
  }
  const parsed: string[] = parseGitIgnore(gitignore);
  const filtered = parsed.filter(s => !s.startsWith('!'));
  return nodeModules.concat(filtered);
}

function getScriptKind(tsModule: RuntimeLibrary['typescript'], langId: string): ts.ScriptKind {
  return langId === 'typescript' ? tsModule.ScriptKind.TS : tsModule.ScriptKind.JS;
}

function getParsedConfig(
  tsModule: RuntimeLibrary['typescript'],
  projectRoot: string,
  tsconfigPath: string | undefined,
  file_extensions: string[]
) {
  const currentProjectPath = tsconfigPath ? dirname(tsconfigPath) : projectRoot;
  const configJson = (tsconfigPath && tsModule.readConfigFile(tsconfigPath, tsModule.sys.readFile).config) || {
    include: file_extensions.map(ext => `**/*.${ext}`),
    exclude: defaultIgnorePatterns(tsModule, currentProjectPath)
  };
  // existingOptions should be empty since it always takes priority
  return tsModule.parseJsonConfigFileContent(
    configJson,
    tsModule.sys,
    currentProjectPath,
    /*existingOptions*/ {},
    tsconfigPath,
    /*resolutionStack*/ undefined,
    file_extensions.map(ext => ({
      extension: ext,
      isMixedContent: true,
      // Note: in order for parsed config to include *.ext files, scriptKind must be set to Deferred.
      // tslint:disable-next-line max-line-length
      // See: https://github.com/microsoft/TypeScript/blob/2106b07f22d6d8f2affe34b9869767fa5bc7a4d9/src/compiler/utilities.ts#L6356
      scriptKind: tsModule.ScriptKind.Deferred
    }))
  );
}
