/**
 * Configuration File Conventions
 *
 * Patterns for recognizing common configuration files.
 */

import type { FileConvention } from "../../entities/conventions";

/**
 * Configuration file conventions.
 */
export const configFileConventions: FileConvention[] = [
  // ============================================================================
  // Package Management
  // ============================================================================
  {
    id: "package-json",
    name: "Package.json",
    description: "Node.js package manifest",
    category: "configuration",
    match: (filepath, filename) => filename === "package.json",
    keywords: ["package", "dependencies", "npm", "scripts", "manifest", "node"],
  },
  {
    id: "pnpm-workspace",
    name: "PNPM Workspace",
    description: "PNPM monorepo workspace configuration",
    category: "configuration",
    match: (filepath, filename) =>
      filename === "pnpm-workspace.yaml" || filename === "pnpm-workspace.yml",
    keywords: ["workspace", "monorepo", "pnpm", "packages"],
  },
  {
    id: "yarn-lock",
    name: "Yarn Lock",
    description: "Yarn dependency lock file",
    category: "configuration",
    match: (filepath, filename) => filename === "yarn.lock",
    keywords: ["dependencies", "lock", "yarn", "versions"],
  },
  {
    id: "package-lock",
    name: "Package Lock",
    description: "NPM dependency lock file",
    category: "configuration",
    match: (filepath, filename) => filename === "package-lock.json",
    keywords: ["dependencies", "lock", "npm", "versions"],
  },
  {
    id: "bun-lockb",
    name: "Bun Lock",
    description: "Bun dependency lock file",
    category: "configuration",
    match: (filepath, filename) =>
      filename === "bun.lockb" || filename === "bun.lock",
    keywords: ["dependencies", "lock", "bun", "versions"],
  },

  // ============================================================================
  // Go
  // ============================================================================
  {
    id: "go-mod",
    name: "Go Module",
    description: "Go module definition file",
    category: "configuration",
    match: (filepath, filename) => filename === "go.mod",
    keywords: [
      "go",
      "golang",
      "module",
      "dependencies",
      "package",
      "workspace",
    ],
  },
  {
    id: "go-sum",
    name: "Go Sum",
    description: "Go module checksum file",
    category: "configuration",
    match: (filepath, filename) => filename === "go.sum",
    keywords: ["go", "golang", "dependencies", "checksum", "lock", "versions"],
  },
  {
    id: "go-work",
    name: "Go Workspace",
    description: "Go workspace configuration for multi-module development",
    category: "configuration",
    match: (filepath, filename) =>
      filename === "go.work" || filename === "go.work.sum",
    keywords: ["go", "golang", "workspace", "monorepo", "modules"],
  },
  {
    id: "makefile",
    name: "Makefile",
    description: "Make build automation file",
    category: "build",
    match: (filepath, filename) =>
      filename === "Makefile" ||
      filename === "makefile" ||
      filename === "GNUmakefile",
    keywords: ["make", "build", "automation", "tasks", "compile"],
  },

  // ============================================================================
  // Python
  // ============================================================================
  {
    id: "requirements-txt",
    name: "Python Requirements",
    description: "Python pip requirements file",
    category: "configuration",
    match: (filepath, filename) =>
      filename === "requirements.txt" ||
      filename.startsWith("requirements-") ||
      filename.startsWith("requirements_"),
    keywords: ["python", "pip", "dependencies", "packages", "requirements"],
  },
  {
    id: "pyproject-toml",
    name: "Python Project",
    description: "Python project configuration (PEP 518/621)",
    category: "configuration",
    match: (filepath, filename) => filename === "pyproject.toml",
    keywords: [
      "python",
      "project",
      "config",
      "poetry",
      "build",
      "dependencies",
      "package",
    ],
  },
  {
    id: "setup-py",
    name: "Python Setup",
    description: "Python package setup script",
    category: "configuration",
    match: (filepath, filename) => filename === "setup.py",
    keywords: ["python", "setup", "package", "install", "distribution"],
  },
  {
    id: "setup-cfg",
    name: "Python Setup Config",
    description: "Python setup configuration file",
    category: "configuration",
    match: (filepath, filename) => filename === "setup.cfg",
    keywords: ["python", "setup", "config", "package", "metadata"],
  },
  {
    id: "pipfile",
    name: "Pipfile",
    description: "Pipenv dependency file",
    category: "configuration",
    match: (filepath, filename) =>
      filename === "Pipfile" || filename === "Pipfile.lock",
    keywords: ["python", "pipenv", "dependencies", "packages", "virtualenv"],
  },
  {
    id: "poetry-lock",
    name: "Poetry Lock",
    description: "Poetry dependency lock file",
    category: "configuration",
    match: (filepath, filename) => filename === "poetry.lock",
    keywords: ["python", "poetry", "dependencies", "lock", "versions"],
  },
  {
    id: "tox-ini",
    name: "Tox Config",
    description: "Tox testing automation configuration",
    category: "test",
    match: (filepath, filename) => filename === "tox.ini",
    keywords: ["python", "tox", "testing", "automation", "environments"],
  },
  {
    id: "pytest-ini",
    name: "Pytest Config",
    description: "Pytest configuration file",
    category: "test",
    match: (filepath, filename) =>
      filename === "pytest.ini" || filename === "conftest.py",
    keywords: ["python", "pytest", "testing", "test", "fixtures"],
  },
  {
    id: "mypy-ini",
    name: "Mypy Config",
    description: "Mypy type checker configuration",
    category: "configuration",
    match: (filepath, filename) =>
      filename === "mypy.ini" || filename === ".mypy.ini",
    keywords: ["python", "mypy", "types", "type checking", "static analysis"],
  },
  {
    id: "flake8",
    name: "Flake8 Config",
    description: "Flake8 linter configuration",
    category: "configuration",
    match: (filepath, filename) => filename === ".flake8",
    keywords: ["python", "flake8", "linting", "lint", "style"],
  },
  {
    id: "pylintrc",
    name: "Pylint Config",
    description: "Pylint linter configuration",
    category: "configuration",
    match: (filepath, filename) =>
      filename === ".pylintrc" ||
      filename === "pylintrc" ||
      filename === "pylint.toml",
    keywords: ["python", "pylint", "linting", "lint", "code quality"],
  },
  {
    id: "ruff-toml",
    name: "Ruff Config",
    description: "Ruff linter/formatter configuration",
    category: "configuration",
    match: (filepath, filename) =>
      filename === "ruff.toml" || filename === ".ruff.toml",
    keywords: ["python", "ruff", "linting", "formatting", "fast"],
  },
  {
    id: "black-toml",
    name: "Black Config",
    description: "Black formatter configuration",
    category: "configuration",
    match: (filepath, filename) => filename === ".black.toml",
    keywords: ["python", "black", "formatting", "format", "style"],
  },

  // ============================================================================
  // TypeScript
  // ============================================================================
  {
    id: "tsconfig",
    name: "TypeScript Config",
    description: "TypeScript compiler configuration",
    category: "configuration",
    match: (filepath, filename) =>
      filename === "tsconfig.json" ||
      (filename.startsWith("tsconfig.") && filename.endsWith(".json")),
    keywords: [
      "typescript",
      "config",
      "compiler",
      "ts",
      "settings",
      "paths",
      "types",
    ],
  },
  {
    id: "jsconfig",
    name: "JavaScript Config",
    description: "JavaScript project configuration",
    category: "configuration",
    match: (filepath, filename) => filename === "jsconfig.json",
    keywords: ["javascript", "config", "compiler", "js", "settings", "paths"],
  },

  // ============================================================================
  // Linting & Formatting
  // ============================================================================
  {
    id: "eslint-config",
    name: "ESLint Config",
    description: "ESLint linting configuration",
    category: "configuration",
    match: (filepath, filename) =>
      filename === ".eslintrc" ||
      filename === ".eslintrc.js" ||
      filename === ".eslintrc.cjs" ||
      filename === ".eslintrc.json" ||
      filename === ".eslintrc.yml" ||
      filename === ".eslintrc.yaml" ||
      filename === "eslint.config.js" ||
      filename === "eslint.config.mjs" ||
      filename === "eslint.config.cjs",
    keywords: ["eslint", "linting", "lint", "rules", "code quality"],
  },
  {
    id: "prettier-config",
    name: "Prettier Config",
    description: "Prettier code formatting configuration",
    category: "configuration",
    match: (filepath, filename) =>
      filename === ".prettierrc" ||
      filename === ".prettierrc.js" ||
      filename === ".prettierrc.cjs" ||
      filename === ".prettierrc.json" ||
      filename === ".prettierrc.yml" ||
      filename === ".prettierrc.yaml" ||
      filename === "prettier.config.js" ||
      filename === "prettier.config.cjs" ||
      filename === "prettier.config.mjs",
    keywords: ["prettier", "formatting", "format", "code style", "style"],
  },
  {
    id: "biome-config",
    name: "Biome Config",
    description: "Biome linting and formatting configuration",
    category: "configuration",
    match: (filepath, filename) =>
      filename === "biome.json" || filename === "biome.jsonc",
    keywords: ["biome", "linting", "formatting", "lint", "format"],
  },

  // ============================================================================
  // Build Tools
  // ============================================================================
  {
    id: "vite-config",
    name: "Vite Config",
    description: "Vite build tool configuration",
    category: "build",
    match: (filepath, filename) =>
      filename === "vite.config.ts" ||
      filename === "vite.config.js" ||
      filename === "vite.config.mjs",
    keywords: ["vite", "bundler", "build", "dev server", "hmr"],
  },
  {
    id: "webpack-config",
    name: "Webpack Config",
    description: "Webpack bundler configuration",
    category: "build",
    match: (filepath, filename) =>
      filename === "webpack.config.js" ||
      filename === "webpack.config.ts" ||
      (filename.startsWith("webpack.") &&
        (filename.endsWith(".js") || filename.endsWith(".ts"))),
    keywords: ["webpack", "bundler", "build", "loaders", "plugins"],
  },
  {
    id: "rollup-config",
    name: "Rollup Config",
    description: "Rollup bundler configuration",
    category: "build",
    match: (filepath, filename) =>
      filename === "rollup.config.js" ||
      filename === "rollup.config.ts" ||
      filename === "rollup.config.mjs",
    keywords: ["rollup", "bundler", "build", "esm", "bundle"],
  },
  {
    id: "esbuild-config",
    name: "esbuild Config",
    description: "esbuild bundler configuration",
    category: "build",
    match: (filepath, filename) =>
      filename === "esbuild.config.js" ||
      filename === "esbuild.config.ts" ||
      filename === "esbuild.config.mjs",
    keywords: ["esbuild", "bundler", "build", "fast"],
  },

  // ============================================================================
  // Testing
  // ============================================================================
  {
    id: "jest-config",
    name: "Jest Config",
    description: "Jest testing framework configuration",
    category: "test",
    match: (filepath, filename) =>
      filename === "jest.config.js" ||
      filename === "jest.config.ts" ||
      filename === "jest.config.mjs" ||
      filename === "jest.config.cjs" ||
      filename === "jest.config.json",
    keywords: ["jest", "testing", "test", "unit test", "config"],
  },
  {
    id: "vitest-config",
    name: "Vitest Config",
    description: "Vitest testing framework configuration",
    category: "test",
    match: (filepath, filename) =>
      filename === "vitest.config.ts" ||
      filename === "vitest.config.js" ||
      filename === "vitest.config.mts",
    keywords: ["vitest", "testing", "test", "unit test", "config"],
  },
  {
    id: "playwright-config",
    name: "Playwright Config",
    description: "Playwright E2E testing configuration",
    category: "test",
    match: (filepath, filename) =>
      filename === "playwright.config.ts" ||
      filename === "playwright.config.js",
    keywords: ["playwright", "testing", "e2e", "end-to-end", "browser test"],
  },
  {
    id: "cypress-config",
    name: "Cypress Config",
    description: "Cypress E2E testing configuration",
    category: "test",
    match: (filepath, filename) =>
      filename === "cypress.config.ts" ||
      filename === "cypress.config.js" ||
      filename === "cypress.json",
    keywords: ["cypress", "testing", "e2e", "end-to-end", "browser test"],
  },

  // ============================================================================
  // Styling
  // ============================================================================
  {
    id: "tailwind-config",
    name: "Tailwind Config",
    description: "Tailwind CSS configuration",
    category: "configuration",
    match: (filepath, filename) =>
      filename === "tailwind.config.js" ||
      filename === "tailwind.config.ts" ||
      filename === "tailwind.config.cjs" ||
      filename === "tailwind.config.mjs",
    keywords: ["tailwind", "css", "styling", "utility", "design"],
  },
  {
    id: "postcss-config",
    name: "PostCSS Config",
    description: "PostCSS configuration",
    category: "configuration",
    match: (filepath, filename) =>
      filename === "postcss.config.js" ||
      filename === "postcss.config.cjs" ||
      filename === "postcss.config.mjs" ||
      filename === ".postcssrc" ||
      filename === ".postcssrc.json",
    keywords: ["postcss", "css", "styling", "transforms"],
  },

  // ============================================================================
  // Environment & Secrets
  // ============================================================================
  {
    id: "env-file",
    name: "Environment File",
    description: "Environment variables file",
    category: "configuration",
    match: (filepath, filename) =>
      filename === ".env" ||
      filename === ".env.local" ||
      filename === ".env.development" ||
      filename === ".env.production" ||
      filename === ".env.test" ||
      filename.startsWith(".env."),
    keywords: ["environment", "env", "variables", "secrets", "config"],
  },
  {
    id: "env-example",
    name: "Environment Example",
    description: "Example environment variables file",
    category: "documentation",
    match: (filepath, filename) =>
      filename === ".env.example" ||
      filename === ".env.sample" ||
      filename === ".env.template",
    keywords: ["environment", "env", "example", "template", "setup"],
  },

  // ============================================================================
  // Deployment & CI/CD
  // ============================================================================
  {
    id: "dockerfile",
    name: "Dockerfile",
    description: "Docker container image definition",
    category: "deployment",
    match: (filepath, filename) =>
      filename === "Dockerfile" || filename.startsWith("Dockerfile."),
    keywords: ["docker", "container", "image", "deployment", "build"],
  },
  {
    id: "docker-compose",
    name: "Docker Compose",
    description: "Docker Compose multi-container configuration",
    category: "deployment",
    match: (filepath, filename) =>
      filename === "docker-compose.yml" ||
      filename === "docker-compose.yaml" ||
      filename === "compose.yml" ||
      filename === "compose.yaml" ||
      filename.startsWith("docker-compose."),
    keywords: ["docker", "compose", "containers", "services", "deployment"],
  },
  {
    id: "github-actions",
    name: "GitHub Actions Workflow",
    description: "GitHub Actions CI/CD workflow",
    category: "deployment",
    match: (filepath) =>
      filepath.includes(".github/workflows/") && filepath.endsWith(".yml"),
    keywords: ["github", "actions", "ci", "cd", "workflow", "automation"],
  },
  {
    id: "vercel-config",
    name: "Vercel Config",
    description: "Vercel deployment configuration",
    category: "deployment",
    match: (filepath, filename) => filename === "vercel.json",
    keywords: ["vercel", "deployment", "hosting", "serverless"],
  },
  {
    id: "netlify-config",
    name: "Netlify Config",
    description: "Netlify deployment configuration",
    category: "deployment",
    match: (filepath, filename) => filename === "netlify.toml",
    keywords: ["netlify", "deployment", "hosting", "functions"],
  },

  // ============================================================================
  // Git
  // ============================================================================
  {
    id: "gitignore",
    name: "Git Ignore",
    description: "Git ignored files configuration",
    category: "configuration",
    match: (filepath, filename) => filename === ".gitignore",
    keywords: ["git", "ignore", "version control", "excluded"],
  },
  {
    id: "gitattributes",
    name: "Git Attributes",
    description: "Git file attributes configuration",
    category: "configuration",
    match: (filepath, filename) => filename === ".gitattributes",
    keywords: ["git", "attributes", "version control", "line endings"],
  },

  // ============================================================================
  // Documentation
  // ============================================================================
  {
    id: "readme",
    name: "README",
    description: "Project documentation",
    category: "documentation",
    match: (filepath, filename) =>
      filename.toLowerCase() === "readme.md" ||
      filename.toLowerCase() === "readme",
    keywords: [
      "readme",
      "documentation",
      "docs",
      "overview",
      "getting started",
    ],
  },
  {
    id: "changelog",
    name: "Changelog",
    description: "Project changelog",
    category: "documentation",
    match: (filepath, filename) =>
      filename.toLowerCase() === "changelog.md" ||
      filename.toLowerCase() === "changelog",
    keywords: ["changelog", "changes", "releases", "history", "versions"],
  },
  {
    id: "contributing",
    name: "Contributing Guide",
    description: "Contribution guidelines",
    category: "documentation",
    match: (filepath, filename) =>
      filename.toLowerCase() === "contributing.md" ||
      filename.toLowerCase() === "contributing",
    keywords: ["contributing", "contribution", "guidelines", "development"],
  },
  {
    id: "license",
    name: "License",
    description: "Project license",
    category: "documentation",
    match: (filepath, filename) =>
      filename.toLowerCase() === "license" ||
      filename.toLowerCase() === "license.md" ||
      filename.toLowerCase() === "license.txt",
    keywords: ["license", "legal", "copyright", "terms"],
  },
];
