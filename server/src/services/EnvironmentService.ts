import { LSPConfig, LSPFullConfig } from '../config';
import { inferVueVersion, VueVersion } from '../utils/vueVersion';

export interface EnvironmentService {
  configure(config: LSPFullConfig): void;
  getConfig(): LSPFullConfig;
  getRootPathForConfig(): string;
  getProjectRoot(): string;
  getTsConfigPath(): string | undefined;
  getPackagePath(): string | undefined;
  getVueVersion(): VueVersion;
}

export function createEnvironmentService(
  rootPathForConfig: string,
  projectPath: string,
  tsconfigPath: string | undefined,
  packagePath: string | undefined,
  initialConfig: LSPConfig
): EnvironmentService {
  let $config = initialConfig;

  return {
    configure(config: LSPFullConfig) {
      $config = config;
    },
    getConfig: () => $config,
    getRootPathForConfig: () => rootPathForConfig,
    getProjectRoot: () => projectPath,
    getTsConfigPath: () => tsconfigPath,
    getPackagePath: () => packagePath,
    getVueVersion: () => inferVueVersion(packagePath)
  };
}
