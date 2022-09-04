import path from 'path';
import {
  getFileFsPath,
  getFsPathToUri,
  getPathDepth,
  normalizeFileNameToFsPath,
  normalizeFileNameResolve
} from '../utils/paths';

import {
  DidChangeConfigurationParams,
  FileChangeType,
  Connection,
  TextDocumentPositionParams,
  InitializeParams,
  ServerCapabilities,
  TextDocumentSyncKind,
  Disposable,
  CodeActionParams,
  CompletionParams,
  ExecuteCommandParams,
} from 'vscode-languageserver';
import {
  CompletionItem,
  CompletionList,
  Definition,
  DocumentHighlight,
  Hover,
  Location,
  SignatureHelp,
  DocumentUri,
  CodeAction,
  CodeActionKind
} from 'vscode-languageserver-types';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import { NULL_COMPLETION, NULL_HOVER, NULL_SIGNATURE } from '../modes/nullMode';
import { createDependencyService, createNodeModulesPaths } from './dependencyService';
import _ from 'lodash';
import { DocumentService } from './documentService';
import { logger } from '../log';
import { getDefaultLSPConfig, LSPFullConfig, getCoffeeSenseFullConfig, CoffeeSenseFullConfig } from '../config';
import { VCancellationToken, VCancellationTokenSource } from '../utils/cancellationToken';
import { findConfigFile, requireUncached } from '../utils/workspace';
import { createProjectService, ProjectService } from './projectService';
import { createEnvironmentService } from './EnvironmentService';
import { accessSync, constants, existsSync } from 'fs';
import { sleep } from '../utils/sleep';
import { URI } from 'vscode-uri';
import transpile_service from './transpileService';

interface ProjectConfig {
  lspFullConfig: LSPFullConfig;
  isExistCoffeeSenseConfig: boolean;
  rootPathForConfig: string;
  workspaceFsPath: string;
  rootFsPath: string;
  tsconfigPath: string | undefined;
  packagePath: string | undefined;
}

export class LSP {
  private workspaces: Map<
    string,
    CoffeeSenseFullConfig & { name: string; workspaceFsPath: string; isExistCoffeeSenseConfig: boolean }
  >;
  private nodeModulesMap: Map<string, string[]>;
  private documentService: DocumentService;
  private loadingProjects: string[];
  private projects: Map<string, ProjectService>;
  private pendingValidationRequests: { [uri: string]: NodeJS.Timer } = {};
  private cancellationTokenValidationRequests: { [uri: string]: VCancellationTokenSource } = {};
  private validationDelayMs = 200;

  private workspaceConfig: unknown;

  constructor(private lspConnection: Connection) {
    this.documentService = new DocumentService(this.lspConnection);
    this.workspaces = new Map();
    this.projects = new Map();
    this.nodeModulesMap = new Map();
    this.loadingProjects = [];
  }

  async init(params: InitializeParams) {
    let rootFsPath = ''
    if(params.rootPath)
      rootFsPath = normalizeFileNameToFsPath(params.rootPath)
    else if(params.rootUri)
      rootFsPath = getFileFsPath(params.rootUri)
    const workspaceFolders =
      Array.isArray(params.workspaceFolders) && params.capabilities.workspace?.workspaceFolders
        ? params.workspaceFolders.map(el => ({ name: el.name, fsPath: getFileFsPath(el.uri) }))
        : rootFsPath
        ? [{ name: '', fsPath: rootFsPath }]
        : [];

    if (workspaceFolders.length === 0) {
      console.error('No workspace path found. CoffeeSense initialization failed.');
      return {
        capabilities: {}
      };
    }

    await Promise.all(workspaceFolders.map(workspace => this.addWorkspace(workspace)));

    if (params.capabilities.workspace?.workspaceFolders) {
      this.setupWorkspaceListeners();
    }
    this.setupConfigListeners();
    this.setupLSPHandlers();
    this.setupCustomLSPHandlers();
    this.setupFileChangeListeners();

    this.lspConnection.onShutdown(() => {
      this.dispose();
    });
  }

  listen() {
    this.lspConnection.listen();
  }

  private getLSPFullConfig(settings: CoffeeSenseFullConfig['settings'], config: any | undefined): LSPFullConfig {
    const result = config ? _.merge(getDefaultLSPConfig(), config) : getDefaultLSPConfig();
    Object.keys(settings).forEach(key => {
      _.set(result, key, settings[key]);
    });
    return result;
  }

  private async addWorkspace(workspace: { name: string; fsPath: string }) {
    // Enable Yarn PnP support https://yarnpkg.com/features/pnp
    if (!process.versions.pnp) {
      if (existsSync(path.join(workspace.fsPath, '.pnp.js'))) {
        require(path.join(workspace.fsPath, '.pnp.js')).setup();
      } else if (existsSync(path.join(workspace.fsPath, '.pnp.cjs'))) {
        require(path.join(workspace.fsPath, '.pnp.cjs')).setup();
      }
    }

    let coffeesenseConfigPath = findConfigFile(workspace.fsPath, 'coffeesense.config.js');
    if (!coffeesenseConfigPath) {
      coffeesenseConfigPath = findConfigFile(workspace.fsPath, 'coffeesense.config.cjs');
    }
    const rootPathForConfig = normalizeFileNameToFsPath(
      coffeesenseConfigPath ? path.dirname(coffeesenseConfigPath) : workspace.fsPath
    );
    if (!this.workspaces.has(rootPathForConfig)) {
      this.workspaces.set(rootPathForConfig, {
        name: workspace.name,
        ...(await getCoffeeSenseFullConfig(
          rootPathForConfig,
          workspace.fsPath,
          coffeesenseConfigPath ? requireUncached(coffeesenseConfigPath) : {}
        )),
        isExistCoffeeSenseConfig: !!coffeesenseConfigPath,
        workspaceFsPath: workspace.fsPath
      });
    }
  }

  private setupWorkspaceListeners() {
    this.lspConnection.onInitialized(() => {
      this.lspConnection.workspace.onDidChangeWorkspaceFolders(async e => {
        await Promise.all(e.added.map(el => this.addWorkspace({ name: el.name, fsPath: getFileFsPath(el.uri) })));
      });
    });
  }

  private setupConfigListeners() {
    this.lspConnection.onDidChangeConfiguration(async ({ settings }: DidChangeConfigurationParams) => {
      this.workspaceConfig = this.getLSPFullConfig({}, settings);
      logger.setLevel((this.workspaceConfig as LSPFullConfig)?.coffeesense?.dev.logLevel);
      this.projects.forEach(project => {
        const coffeesenseConfig = this.workspaces.get(project.env.getRootPathForConfig());
        if (!coffeesenseConfig) {
          return;
        }
        const fullConfig = this.getLSPFullConfig(coffeesenseConfig.settings, this.workspaceConfig);
        project.env.configure(fullConfig);
      });
    });

    this.documentService.getAllDocuments().forEach(this.triggerValidation);
  }

  private getAllProjectConfigs(): ProjectConfig[] {
    return _.flatten(
      Array.from(this.workspaces.entries()).map(([rootPathForConfig, coffeesenseConfig]) =>
        coffeesenseConfig.projects.map(project => ({
          ...project,
          rootPathForConfig,
          lspFullConfig: this.getLSPFullConfig(coffeesenseConfig.settings, this.workspaceConfig),
          workspaceFsPath: coffeesenseConfig.workspaceFsPath,
          isExistCoffeeSenseConfig: coffeesenseConfig.isExistCoffeeSenseConfig
        }))
      )
    )
      .map(project => ({
        lspFullConfig: project.lspFullConfig,
        isExistCoffeeSenseConfig: project.isExistCoffeeSenseConfig,
        rootPathForConfig: project.rootPathForConfig,
        workspaceFsPath: project.workspaceFsPath,
        rootFsPath: project.root,
        tsconfigPath: project.tsconfig,
        packagePath: project.package
      }))
      .sort((a, b) => getPathDepth(b.rootFsPath, '/') - getPathDepth(a.rootFsPath, '/'));
  }

  private warnProjectIfNeed(projectConfig: ProjectConfig) {
    if (projectConfig.lspFullConfig.coffeesense.ignoreProjectWarning) {
      return;
    }

    const isFileCanAccess = (fsPath: string) => {
      try {
        accessSync(fsPath, constants.R_OK);
        return true;
      } catch {
        return false;
      }
    };
    const showErrorIfCantAccess = (name: string, fsPath: string) => {
      this.lspConnection.window.showErrorMessage(`CoffeeSense can't access ${fsPath} for ${name}.`);
    };

    const showWarningAndLearnMore = (message: string, url: string) => {
      this.lspConnection.window.showWarningMessage(message, { title: 'Learn More' }).then(action => {
        if (action) {
          this.openWebsite(url);
        }
      });
    };

    const getCantFindMessage = (fileNames: string[]) =>
      `CoffeeSense can't find ${fileNames.map(el => `\`${el}\``).join(' or ')} in ${projectConfig.rootFsPath}.`;
    if (!projectConfig.tsconfigPath) {
      showWarningAndLearnMore(
        getCantFindMessage(['tsconfig.json', 'jsconfig.json']),
        'https://github.com/phil294/coffeesense/blob/master/docs/guide/FAQ.md#coffeesense-can-t-find-tsconfig-json-jsconfig-json-in-xxxx-xxxxxx'
      );
    } else if (!isFileCanAccess(projectConfig.tsconfigPath)) {
      showErrorIfCantAccess('ts/js config', projectConfig.tsconfigPath);
    } else {
      if (
        !projectConfig.isExistCoffeeSenseConfig &&
        ![
          normalizeFileNameResolve(projectConfig.rootFsPath, 'tsconfig.json'),
          normalizeFileNameResolve(projectConfig.rootFsPath, 'jsconfig.json')
        ].includes(projectConfig.tsconfigPath ?? '')
      ) {
        showWarningAndLearnMore(
          `CoffeeSense found \`tsconfig.json\`/\`jsconfig.json\`, but they aren\'t in the project root.`,
          'https://github.com/phil294/coffeesense/blob/master/docs/guide/FAQ.md#coffeesense-found-xxx-but-they-aren-t-in-the-project-root'
        );
      }
    }

    if (!projectConfig.packagePath) {
      showWarningAndLearnMore(
        getCantFindMessage(['package.json']),
        'https://github.com/phil294/coffeesense/blob/master/docs/guide/FAQ.md#coffeesense-can-t-find-package-json-in-xxxx-xxxxxx'
      );
    } else if (!isFileCanAccess(projectConfig.packagePath)) {
      showErrorIfCantAccess('ts/js config', projectConfig.packagePath);
    } else {
      if (
        !projectConfig.isExistCoffeeSenseConfig &&
        normalizeFileNameResolve(projectConfig.rootFsPath, 'package.json') !== projectConfig.packagePath
      ) {
        showWarningAndLearnMore(
          `CoffeeSense found \`package.json\`/, but it isn\'t in the project root.`,
          'https://github.com/phil294/coffeesense/blob/master/docs/guide/FAQ.md#coffeesense-found-xxx-but-they-aren-t-in-the-project-root'
        );
      }
    }
  }

  getProjectRootPath(uri: DocumentUri): string | undefined {
    return this.getProjectConfig(uri)?.rootFsPath;
  }

  private getProjectConfig(uri: DocumentUri): ProjectConfig | undefined {
    const projectConfigs = this.getAllProjectConfigs();
    const docFsPath = getFileFsPath(uri);
    const projectConfig = projectConfigs.find(
      projectConfig =>
        docFsPath.startsWith(projectConfig.rootFsPath) &&
        ['/', '\\'].includes(docFsPath.substring(projectConfig.rootFsPath.length, projectConfig.rootFsPath.length + 1))
    );

    return projectConfig;
  }

  private async getProjectService(uri: DocumentUri): Promise<ProjectService | undefined> {
    const projectConfig = this.getProjectConfig(uri);
    if (!projectConfig) {
      return undefined;
    }
    const useWorkspaceDependencies = projectConfig.lspFullConfig.coffeesense.useWorkspaceDependencies;
    if (this.projects.has(projectConfig.rootFsPath)) {
      const project = this.projects.get(projectConfig.rootFsPath);
      if (project?.env.getConfig().coffeesense.useWorkspaceDependencies === useWorkspaceDependencies) {
        return project;
      }
    }
    // Load project once
    if (this.loadingProjects.includes(projectConfig.rootFsPath)) {
      while (!this.projects.has(projectConfig.rootFsPath)) {
        await sleep(500);
      }
      return this.projects.get(projectConfig.rootFsPath);
    }

    // init project
    // Yarn Pnp don't need this. https://yarnpkg.com/features/pnp
    this.loadingProjects.push(projectConfig.rootFsPath);
    const workDoneProgress = await this.lspConnection.window.createWorkDoneProgress();
    workDoneProgress.begin(`Load project: ${projectConfig.rootFsPath}`, undefined);
    const nodeModulePaths = useWorkspaceDependencies
      ? this.nodeModulesMap.get(projectConfig.rootPathForConfig) ??
        createNodeModulesPaths(projectConfig.rootPathForConfig)
      : [];
    if (useWorkspaceDependencies) {
      this.nodeModulesMap.set(projectConfig.rootPathForConfig, nodeModulePaths);
    }
    const dependencyService = await createDependencyService(
      projectConfig.rootPathForConfig,
      projectConfig.workspaceFsPath,
      projectConfig.lspFullConfig.coffeesense.useWorkspaceDependencies,
      nodeModulePaths,
      projectConfig.lspFullConfig.typescript.tsdk
    );
    this.warnProjectIfNeed(projectConfig);
    const project = await createProjectService(
      createEnvironmentService(
        projectConfig.rootPathForConfig,
        projectConfig.rootFsPath,
        projectConfig.tsconfigPath,
        projectConfig.packagePath,
        projectConfig.lspFullConfig
      ),
      this.documentService,
      dependencyService
    );
    this.projects.set(projectConfig.rootFsPath, project);
    workDoneProgress.done();
    return project;
  }

  private setupLSPHandlers() {
    this.lspConnection.onCompletion(this.onCompletion.bind(this));
    this.lspConnection.onCompletionResolve(this.onCompletionResolve.bind(this));

    this.lspConnection.onDefinition(this.onDefinition.bind(this));
    this.lspConnection.onDocumentHighlight(this.onDocumentHighlight.bind(this));
    this.lspConnection.onHover(this.onHover.bind(this));
    this.lspConnection.onReferences(this.onReferences.bind(this));
    this.lspConnection.onSignatureHelp(this.onSignatureHelp.bind(this));
    this.lspConnection.onCodeAction(this.onCodeAction.bind(this));
    this.lspConnection.onCodeActionResolve(this.onCodeActionResolve.bind(this));

    this.lspConnection.onExecuteCommand(this.executeCommand.bind(this));
  }

  private setupCustomLSPHandlers() {
    this.lspConnection.onRequest('$/doctor', async ({ fileName }) => {
      const uri = getFsPathToUri(fileName);
      const js = transpile_service.result_by_uri.get(uri)?.js

      return JSON.stringify(
        {
          name: 'CoffeeSense showGeneratedJavascript info',
          fileName,
          js,
        },
        null,
        2
      );
    });

    this.lspConnection.onRequest('$/getDiagnostics', async params => {
      const doc = this.documentService.getDocument(params.uri);
      if (doc) {
        const diagnostics = await this.doValidate(doc);
        return diagnostics ?? [];
      }
      return [];
    });
  }

  private setupFileChangeListeners() {
    this.documentService.onDidChangeContent(change => {
      this.triggerValidation(change.document);
    });
    this.documentService.onDidClose(e => {
      this.removeDocument(e.document);
      this.lspConnection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
    });
    this.lspConnection.onDidChangeWatchedFiles(({ changes }) => {
      changes.forEach(async c => {
        if (c.type === FileChangeType.Changed) {
          const fsPath = getFileFsPath(c.uri);

          // when `coffeesense.config.js` changed
          if (this.workspaces.has(fsPath)) {
            logger.logInfo(`refresh coffeesense config when ${fsPath} changed.`);
            const name = this.workspaces.get(fsPath)?.name ?? '';
            this.workspaces.delete(fsPath);
            await this.addWorkspace({ name, fsPath });
            this.projects.forEach((project, projectRoot) => {
              if (project.env.getRootPathForConfig() === fsPath) {
                project.dispose();
                this.projects.delete(projectRoot);
              }
            });
            return;
          }

          const project = await this.getProjectService(c.uri);
          project?.languageModes.getAllModes().forEach(m => {
            if (m.onDocumentChanged) {
              m.onDocumentChanged(fsPath);
            }
          });
        }
      });

      this.documentService.getAllDocuments().forEach(d => {
        this.triggerValidation(d);
      });
    });
  }

  /**
   * Custom Notifications
   */
  openWebsite(url: string): void {
    this.lspConnection.window.showDocument({ uri: URI.parse(url).toString(), external: true });
  }

  /**
   * Language Features
   */

  async onCompletion(params: CompletionParams): Promise<CompletionList> {
    const project = await this.getProjectService(params.textDocument.uri);

    return project?.onCompletion(params) ?? NULL_COMPLETION;
  }

  async onCompletionResolve(item: CompletionItem): Promise<CompletionItem> {
    if (!item.data) {
      return item;
    }
    const project = await this.getProjectService(item.data.uri);

    return project?.onCompletionResolve(item) ?? item;
  }

  async onHover(params: TextDocumentPositionParams): Promise<Hover> {
    const project = await this.getProjectService(params.textDocument.uri);

    return project?.onHover(params) ?? NULL_HOVER;
  }

  async onDocumentHighlight(params: TextDocumentPositionParams): Promise<DocumentHighlight[]> {
    const project = await this.getProjectService(params.textDocument.uri);

    return project?.onDocumentHighlight(params) ?? [];
  }

  async onDefinition(params: TextDocumentPositionParams): Promise<Definition> {
    const project = await this.getProjectService(params.textDocument.uri);

    return project?.onDefinition(params) ?? [];
  }

  async onReferences(params: TextDocumentPositionParams): Promise<Location[]> {
    const project = await this.getProjectService(params.textDocument.uri);

    return project?.onReferences(params) ?? [];
  }

  async onSignatureHelp(params: TextDocumentPositionParams): Promise<SignatureHelp | null> {
    const project = await this.getProjectService(params.textDocument.uri);

    return project?.onSignatureHelp(params) ?? NULL_SIGNATURE;
  }

  async onCodeAction(params: CodeActionParams) {
    const project = await this.getProjectService(params.textDocument.uri);

    return project?.onCodeAction(params) ?? [];
  }

  async onCodeActionResolve(action: CodeAction) {
    if (!action.data) {
      return action;
    }
    const project = await this.getProjectService((action.data as { uri: string })?.uri);

    return project?.onCodeActionResolve(action) ?? action;
  }

  private triggerValidation(textDocument: TextDocument): void {
    if (textDocument.uri.includes('node_modules')) {
      return;
    }

    this.cleanPendingValidation(textDocument);
    this.cancelPastValidation(textDocument);
    this.pendingValidationRequests[textDocument.uri] = setTimeout(() => {
      delete this.pendingValidationRequests[textDocument.uri];
      this.cancellationTokenValidationRequests[textDocument.uri] = new VCancellationTokenSource();
      this.validateTextDocument(textDocument, this.cancellationTokenValidationRequests[textDocument.uri]!.token);
    }, this.validationDelayMs);
  }

  cancelPastValidation(textDocument: TextDocument): void {
    const source = this.cancellationTokenValidationRequests[textDocument.uri];
    if (source) {
      source.cancel();
      source.dispose();
      delete this.cancellationTokenValidationRequests[textDocument.uri];
    }
  }

  cleanPendingValidation(textDocument: TextDocument): void {
    const request = this.pendingValidationRequests[textDocument.uri];
    if (request) {
      clearTimeout(request);
      delete this.pendingValidationRequests[textDocument.uri];
    }
  }

  async validateTextDocument(textDocument: TextDocument, cancellationToken?: VCancellationToken) {
    const diagnostics = await this.doValidate(textDocument, cancellationToken);
    if (diagnostics) {
      this.lspConnection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
    }
  }

  async doValidate(doc: TextDocument, cancellationToken?: VCancellationToken) {
    const project = await this.getProjectService(doc.uri);

    return project?.doValidate(doc, cancellationToken) ?? null;
  }

  async executeCommand(arg: ExecuteCommandParams) {
    logger.logInfo(`Unknown command ${arg.command}.`);
  }

  async removeDocument(doc: TextDocument): Promise<void> {
    const project = await this.getProjectService(doc.uri);
    project?.languageModes.onDocumentRemoved(doc);
  }

  dispose(): void {
    this.projects.forEach(project => {
      project.dispose();
    });
  }

  get capabilities(): ServerCapabilities {
    return {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      workspace: {
        workspaceFolders: { supported: true, changeNotifications: true }
      },
      completionProvider: { resolveProvider: true, triggerCharacters: ['.', ':', '<', '"', "'", '/', '@', '*'] },
      signatureHelpProvider: { triggerCharacters: ['(', ' '] },
      documentFormattingProvider: false,
      hoverProvider: true,
      documentHighlightProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      codeActionProvider: {
        codeActionKinds: [CodeActionKind.SourceOrganizeImports],
        resolveProvider: true
      },
      executeCommandProvider: {
        commands: []
      }
    };
  }
}
