import { LSPFullConfig } from '../config';
import { DEFAULT_FILE_EXTENSION, LANGUAGE_ID } from '../language';

export interface EnvironmentService {
  configure(config: LSPFullConfig): void;
  getConfig(): LSPFullConfig;
  getRootPathForConfig(): string;
  getProjectRoot(): string;
  getTsConfigPath(): string | undefined;
  getPackagePath(): string | undefined;
  /** What the user has configured as relevant file exts. Each without leading dot */
  get_file_extensions(): string[];
}

let $config: LSPFullConfig
let $extensions: string[]
  
const setConfig = (config: LSPFullConfig) => {
  $config = config;

  $extensions = [...new Set([
    DEFAULT_FILE_EXTENSION,
    ...Object.entries($config.files?.associations || {})
      .filter(e => e[1] === LANGUAGE_ID)
      .map(e => e[0])
      .filter(extension_match =>
        // VSCode's File associations can be any kind of glob pattern:
        // https://code.visualstudio.com/updates/vMarch#_file-to-language-association
        // But we need a clear list of extensions that can be passed to tsModule,
        // so anything other than *.ext is ignored.
        // Other IDEs would not even have this config option at all.
        extension_match.match(/^\*\.[a-zA-Z_0-9-]+$/))
      .map(dot_ext => dot_ext.slice(2))
  ])]
}

export function createEnvironmentService(
  rootPathForConfig: string,
  projectPath: string,
  tsconfigPath: string | undefined,
  packagePath: string | undefined,
  initialConfig: LSPFullConfig
): EnvironmentService {
  setConfig(initialConfig)

  return {
    configure(config: LSPFullConfig) {
      setConfig(config)
    },
    getConfig: () => $config,
    getRootPathForConfig: () => rootPathForConfig,
    getProjectRoot: () => projectPath,
    getTsConfigPath: () => tsconfigPath,
    getPackagePath: () => packagePath,
    get_file_extensions: () => $extensions
  };
}
