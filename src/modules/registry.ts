// Module registry - manages available index modules
import { IndexModule, ModuleRegistry, Config } from "../types";

class ModuleRegistryImpl implements ModuleRegistry {
  private modules = new Map<string, IndexModule>();

  register(module: IndexModule): void {
    // Idempotent registration: avoid noisy logs when called multiple times
    if (!this.modules.has(module.id)) {
      this.modules.set(module.id, module);
    }
  }

  get(id: string): IndexModule | undefined {
    return this.modules.get(id);
  }

  list(): IndexModule[] {
    return Array.from(this.modules.values());
  }

  getEnabled(config: Config): IndexModule[] {
    const enabledIds = new Set(
      config.modules.filter((m) => m.enabled).map((m) => m.id)
    );

    return this.list().filter((m) => enabledIds.has(m.id));
  }
}

// Global singleton registry
export const registry: ModuleRegistry = new ModuleRegistryImpl();

// Auto-register built-in modules
export async function registerBuiltInModules(): Promise<void> {
  // Dynamic import to avoid circular dependencies
  const { CoreModule } = await import("./core");
  const { TypeScriptModule } = await import("./language/typescript");
  const { PythonModule } = await import("./language/python");
  const { GoModule } = await import("./language/go");
  const { RustModule } = await import("./language/rust");
  const { JsonModule } = await import("./data/json");
  const { MarkdownModule } = await import("./docs/markdown");

  // Register core module first (fast, language-agnostic)
  registry.register(new CoreModule());

  // Register language-specific modules
  registry.register(new TypeScriptModule());
  registry.register(new PythonModule());
  registry.register(new GoModule());
  registry.register(new RustModule());

  // Register data format modules
  registry.register(new JsonModule());

  // Register documentation modules
  registry.register(new MarkdownModule());
}
