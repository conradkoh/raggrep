// Module registry - manages available index modules
import { IndexModule, ModuleRegistry, Config } from '../types';

class ModuleRegistryImpl implements ModuleRegistry {
  private modules = new Map<string, IndexModule>();

  register(module: IndexModule): void {
    if (this.modules.has(module.id)) {
      console.warn(`Module '${module.id}' is already registered, overwriting...`);
    }
    this.modules.set(module.id, module);
  }

  get(id: string): IndexModule | undefined {
    return this.modules.get(id);
  }

  list(): IndexModule[] {
    return Array.from(this.modules.values());
  }

  getEnabled(config: Config): IndexModule[] {
    const enabledIds = new Set(
      config.modules
        .filter(m => m.enabled)
        .map(m => m.id)
    );
    
    return this.list().filter(m => enabledIds.has(m.id));
  }
}

// Global singleton registry
export const registry: ModuleRegistry = new ModuleRegistryImpl();

// Auto-register built-in modules
export async function registerBuiltInModules(): Promise<void> {
  // Dynamic import to avoid circular dependencies
  const { SemanticModule } = await import('./semantic');
  registry.register(new SemanticModule());
}
