/**
 * Composition Root
 * 
 * This is the single place where all dependencies are wired together.
 * The composition root creates concrete implementations and injects them
 * into use cases and services.
 * 
 * This is the only file that knows about concrete implementations.
 * Everything else depends only on interfaces (ports).
 */

import type { Config, FileIndex, ModuleManifest, GlobalManifest } from './domain/entities';
import type { FileSystem } from './domain/ports';
import type { IndexModule, IndexContext, SearchContext } from './types';

// Infrastructure implementations
import { NodeFileSystem, nodeFileSystem } from './infrastructure/filesystem';
import { TransformersEmbeddingProvider } from './infrastructure/embeddings';
import { FileIndexStorage } from './infrastructure/storage';

// Module registry
import { registry, registerBuiltInModules } from './modules/registry';

// ============================================================================
// Service Container
// ============================================================================

/**
 * Container for all application services.
 * Created once and passed to use cases.
 */
export interface ServiceContainer {
  fileSystem: FileSystem;
  storage: FileIndexStorage;
  getEnabledModules: (config: Config) => IndexModule[];
  getModule: (moduleId: string) => IndexModule | undefined;
  initializeModule: (module: IndexModule, config: Config) => Promise<void>;
}

/**
 * Create a service container for a specific project directory.
 */
export async function createServiceContainer(rootDir: string): Promise<ServiceContainer> {
  // Ensure modules are registered
  await registerBuiltInModules();
  
  const fileSystem = nodeFileSystem;
  const storage = new FileIndexStorage(fileSystem, rootDir);
  
  return {
    fileSystem,
    storage,
    
    getEnabledModules: (config: Config) => {
      return registry.getEnabled(config);
    },
    
    getModule: (moduleId: string) => {
      return registry.get(moduleId);
    },
    
    initializeModule: async (module: IndexModule, config: Config) => {
      const moduleConfig = config.modules.find(m => m.id === module.id);
      if (module.initialize && moduleConfig) {
        await module.initialize(moduleConfig);
      }
    },
  };
}

// ============================================================================
// Use Case Dependencies
// ============================================================================

import type { 
  IndexDirectoryDependencies 
} from './domain/usecases/indexDirectory';
import type { 
  SearchIndexDependencies 
} from './domain/usecases/searchIndex';
import type { 
  CleanupIndexDependencies 
} from './domain/usecases/cleanupIndex';

/**
 * Create dependencies for the indexDirectory use case.
 */
export function createIndexDependencies(container: ServiceContainer): IndexDirectoryDependencies {
  return {
    fileSystem: container.fileSystem,
    loadConfig: () => container.storage.loadConfig(),
    getEnabledModules: container.getEnabledModules,
    initializeModule: container.initializeModule,
  };
}

/**
 * Create dependencies for the searchIndex use case.
 */
export function createSearchDependencies(container: ServiceContainer): SearchIndexDependencies {
  const { storage, fileSystem } = container;
  
  return {
    fileSystem: container.fileSystem,
    loadConfig: () => storage.loadConfig(),
    
    getIndexedModules: async (rootDir: string, config: Config) => {
      const manifest = await storage.loadGlobalManifest();
      return manifest?.modules ?? [];
    },
    
    getModule: container.getModule,
    initializeModule: container.initializeModule,
    
    loadFileIndex: async (rootDir: string, moduleId: string, filepath: string, config: Config) => {
      return storage.loadFileIndex(moduleId, filepath);
    },
    
    listIndexedFiles: async (rootDir: string, moduleId: string, config: Config) => {
      return storage.listIndexedFiles(moduleId);
    },
  };
}

/**
 * Create dependencies for the cleanupIndex use case.
 */
export function createCleanupDependencies(container: ServiceContainer): CleanupIndexDependencies {
  const { storage } = container;
  
  return {
    fileSystem: container.fileSystem,
    loadConfig: () => storage.loadConfig(),
    getEnabledModules: container.getEnabledModules,
    
    loadModuleManifest: async (rootDir: string, moduleId: string, config: Config) => {
      return storage.loadModuleManifest(moduleId);
    },
    
    saveModuleManifest: async (rootDir: string, moduleId: string, manifest: ModuleManifest, config: Config) => {
      return storage.saveModuleManifest(moduleId, manifest);
    },
    
    deleteFileIndex: async (rootDir: string, moduleId: string, filepath: string, config: Config) => {
      return storage.deleteFileIndex(moduleId, filepath);
    },
  };
}

// ============================================================================
// Context Factories (for modules)
// ============================================================================

/**
 * Create an IndexContext for a module.
 */
export function createIndexContext(
  rootDir: string, 
  config: Config, 
  fileSystem: FileSystem
): IndexContext {
  return {
    rootDir,
    config,
    readFile: async (filepath: string) => {
      const fullPath = fileSystem.resolve(rootDir, filepath);
      return fileSystem.readFile(fullPath);
    },
    getFileStats: async (filepath: string) => {
      const fullPath = fileSystem.resolve(rootDir, filepath);
      const stats = await fileSystem.getStats(fullPath);
      return { lastModified: stats.lastModified };
    },
  };
}

/**
 * Create a SearchContext for a module.
 */
export function createSearchContext(
  rootDir: string,
  moduleId: string,
  config: Config,
  storage: FileIndexStorage
): SearchContext {
  return {
    rootDir,
    config,
    loadFileIndex: (filepath: string) => storage.loadFileIndex(moduleId, filepath),
    listIndexedFiles: () => storage.listIndexedFiles(moduleId),
  };
}

