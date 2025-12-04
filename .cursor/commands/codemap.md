---
mode: agent
---

# Codemap Meta Rules

<!-- <section:definition> -->
## Definition

A codemap is an index that shows a map to all relevant files for a given feature. It serves as the single source of truth for understanding how a feature is implemented across the codebase.

A projectmap is a high-level architectural overview that documents the entire project's structure, technology stack, and organizational patterns. Unlike codemaps which focus on specific features, a projectmap provides the foundational context for understanding the overall system architecture.
<!-- </section:definition> -->

<!-- <section:file-requirements> -->
## File Requirements

### Codemaps

1. **Location**: All codemaps MUST be stored in `$projectroot/codemaps/` folder
2. **Naming**: Filename MUST follow pattern `$featurename.codemap.md`
3. **Format**: MUST be markdown format with structured sections
4. **Template**: MUST follow structure defined in `codemaps/templates/template.codemap.md`

### Projectmap

1. **Location**: MUST be stored as `$projectroot/codemaps/projectmap.md`
2. **Purpose**: Provides architectural overview and project structure documentation
3. **Format**: MUST be markdown format with structured sections
4. **Template**: MUST follow structure defined in `codemaps/templates/template.projectmap.md`
5. **Scope**: MUST cover entire project architecture, not individual features
6. **Maintenance**: MUST be updated when project structure or tech stack changes
<!-- </section:file-requirements> -->

<!-- <section:file-locations> -->
## File Locations

- **Codemap Template**: `codemaps/templates/template.codemap.md` - Use this template when creating new codemaps
- **Projectmap Template**: `codemaps/templates/template.projectmap.md` - Use this template when creating new projectmaps
- **Projectmap**: `codemaps/projectmap.md` - High-level project architecture and structure overview
- **Existing Codemaps**: `codemaps/` directory - Review existing codemaps for reference and patterns
<!-- </section:file-locations> -->

<!-- <section:required-sections> -->
## Required Sections

### Codemaps

1. **Title**: Concise feature title describing the flow
2. **Description**: Brief explanation of what the flow accomplishes and its purpose
3. **Sequence Diagram**: High-level flow showing function calls between layers
4. **Frontend Files**: ALL frontend files with clear subsection grouping
5. **Backend Files**: ALL backend files with clear subsection grouping
6. **Contracts**: ALL communication protocols between frontend and backend

### Projectmap

1. **Project Structure**: Comprehensive mapping of all major directories and their purposes
   - Root configuration files and automation scripts
   - Documentation directories and knowledge management structure
   - Frontend application structure and organization patterns
   - UI component hierarchy and design system architecture
   - Utility libraries and shared code organization
   - Backend service structure and API organization
   - Data models and business logic architecture
   - Database schema files and data layer definitions
   - Repository layers and data access patterns
   - Development tooling and support scripts
2. **Monorepo Workspaces**: Entry points and workspace configuration for multi-package repositories
3. **Tech Stack**: Complete technology inventory
   - Package management and dependency coordination
   - Frontend and backend framework ecosystems
   - Core libraries and their architectural roles
   - Third-party service clients and external API integrations
   - Development tooling and quality assurance systems
   - Testing infrastructure and validation approaches
   - Build systems and deployment pipelines
4. **Development Patterns**: Established practices and architectural conventions
   - Authentication and authorization patterns
   - Code organization and quality maintenance approaches
   - Configuration management and feature control patterns
   - User experience and interface design conventions
   - Cross-cutting concerns and shared utilities
5. **Testing Strategy**: Quality assurance approach and coverage
   - Testing framework adoption and gaps
   - Validation strategies across application layers
    - Quality gates and automated checks
    - Type safety and compile-time validation
<!-- </section:required-sections> -->

<!-- <section:required-details> -->
## Required Details

### Function Interfaces

- **MUST copy** actual TypeScript interfaces/types from the codebase into the codemap
- **Format**: `functionName(params: ParamType): ReturnType` using the exact exported names
- **Interface inclusion**: When interfaces exist in the code, copy their full definition into the Contracts section
- **Naming**: Use the exact exported names from the codebase (e.g., `CommandAction`, not `ICommandAction`)
- **Documentation-only types**: Only create new interface definitions when no exported type exists, and label them clearly as "documentation-only"
- **Apply to**: All functions across relevant layers (frontend, backend, usecases, utilities)

### Sequence Diagram

- **MUST include**: PlantUML sequence diagram showing function call flow
- **MUST show**: Function names with parameter and return types: `functionName(params: ParamType): ReturnType`
- **Format**: Use exact function signatures from the codebase with actual parameter and return types
- **Examples**: `useAccountCommands(): AccountCommandsReturn`, `registerActions(parentId: string, actions: CommandAction[]): void`
- **MUST demonstrate**: How components across layers interact with complete type information
- **Use PlantUML syntax** with descriptive comments explaining the flow

### URL Parameters

- **MUST document**: ALL URL parameters being read from routes
- **MUST document**: ALL search parameters being processed
- **Format**: List parameter name and describe its purpose
- **Apply to**: ALL route files that read dynamic segments or query parameters

### Interface Standardization

- **MUST use**: TypeScript interfaces even for non-TypeScript implementations
- **Purpose**: Provide precision in expressing intent and tie related components together
- **Scope**: ALL data structures, parameters, and return types
<!-- </section:required-details> -->

<!-- <section:scope-guidelines> -->
## Scope Guidelines

- **Single Flow**: Each codemap MUST represent exactly one user flow or feature workflow
- **Focused**: NEVER mix multiple unrelated features in one codemap
- **Complete**: MUST include ALL files necessary for the specific flow to function
- **Minimal**: SHOULD exclude files not directly related to the flow
<!-- </section:scope-guidelines> -->

<!-- <section:scope-discipline> -->
## Scope Discipline

### User Request Boundaries

- **MUST**: Implement only what the user explicitly requested
- **MUST**: Ask before adding related features not mentioned in the request
- **NEVER**: Assume additional integrations are wanted without explicit user direction
- **MAY**: Mention related opportunities in a separate "Future Enhancements" section

### Feature Inference Rules

- **MUST**: Distinguish between "required for functionality" vs "nice to have patterns"
- **MUST**: When in doubt about scope, ask the user for clarification before proceeding
- **SHOULD**: Focus on the minimal viable implementation that satisfies the request
- **NEVER**: Add features based solely on existing codebase patterns without user confirmation

### Implementation Boundaries

- **Required**: Features explicitly mentioned in user request
- **Required**: Integrations necessary for basic functionality (error handling, navigation)
- **Optional**: Pattern consistency that wasn't explicitly requested
- **Optional**: Additional access methods not mentioned in the request

### When to Expand Scope

- **MUST ask user first**: Before adding features not explicitly requested
- **MAY suggest**: Additional integrations in a separate "Future Enhancements" section
- **NEVER assume**: That following all existing patterns is required
<!-- </section:scope-discipline> -->

<!-- <section:language-standards> -->
## Language Standards

- **MUST**: Mandatory requirements, non-negotiable
- **SHOULD**: Recommended best practices
- **MAY**: Optional features or alternatives
- **NEVER**: Prohibited actions or patterns
<!-- </section:language-standards> -->

<!-- <section:writing-style> -->
## Writing Style

- **Low verbosity**: Use concise, precise language
- **High clarity**: Each statement MUST be unambiguous
- **Action-oriented**: Focus on what to do, not background theory
- **Structured**: Use consistent formatting and organization
- **Comprehensive coverage**: Document what exists AND explicitly note what is missing
- **Practical focus**: Emphasize patterns and libraries that directly impact development workflow
<!-- </section:writing-style> -->

<!-- <section:primary-interactions> -->
## Primary Interactions

### 1. Plan

**Purpose**: Create or modify codemap before implementing changes

**Decision Logic**: MUST determine scenario before proceeding:

- **New Feature**: Feature does not exist in codebase → Create new codemap using template
- **Existing Feature**: Feature already implemented → Check for existing codemap
  - If codemap exists: Update existing codemap first, then apply changes
  - If no codemap exists: Prompt user to generate codemap from existing implementation before proceeding

**Template Usage**: MUST use `codemaps/templates/template.codemap.md` as starting point

**Actions for New Feature**:

- Copy template to new codemap file following naming convention
- **Scope Validation**: Confirm implementation scope with user before proceeding:
  - What specific access methods were requested?
  - Are there existing patterns that MUST be followed vs. patterns that are optional?
  - Should additional integrations be included or proposed separately?
- Define data model and key architectural decisions
- Plan file locations and structure across all application layers
- Identify core files that need creation/modification
- Document function interfaces and data flow between layers

**Actions for Existing Feature (No Codemap)**:

- **Scope Validation**: Confirm what modifications are actually requested before proceeding
- Analyze existing codebase to identify all files related to the feature
- Document current implementation patterns and data flow
- Create codemap reflecting actual implementation state
- Validate codemap accuracy against current codebase

### 2. Update

**Purpose**: Modify existing codemap for planned changes to existing features

**Prerequisite**: Existing codemap MUST be located and validated first

**Actions**:

- Locate existing codemap in `codemaps/` directory
- Review current codemap state against actual codebase
- Plan modifications to codemap reflecting intended changes
- Update codemap with new file paths, functions, and contracts
- Ensure backward compatibility considerations are documented

### 4. Apply

**Purpose**: Use codemap as source of truth to implement code changes

**Actions**:

- Implement changes to match codemap specifications
- Create missing files as defined in codemap
- Update existing files to conform to contracts
- Ensure all file paths and structures exist as documented
<!-- </section:primary-interactions> -->

<!-- <section:validation-rules> -->
## Validation Rules

### Codemaps

1. Every codemap MUST include all required sections as defined in template
2. File paths MUST be accurate and up-to-date relative to project root
3. Contracts MUST match actual implementation with proper TypeScript interfaces
4. Language MUST follow specified standards (MUST/SHOULD/MAY/NEVER)
5. Updates MUST be made when feature files change
6. Sequence diagrams MUST demonstrate complete flow between all layers

### Projectmap

1. Project structure MUST reflect actual directory layout and file organization
2. Documentation structure MUST include all knowledge management directories and their purposes
3. Tech stack information MUST match configuration files and dependency manifests
4. Core libraries MUST be documented with their architectural roles and integration patterns
5. Workspace definitions MUST align with monorepo configuration (if applicable)
6. Entry points MUST be verified and functional
7. Development patterns MUST document established practices and architectural conventions
8. Testing strategy MUST explicitly document validation approaches or gaps where absent
9. Architecture documentation MUST be updated when major structural changes occur
10. Technology versions SHOULD be documented where relevant for major dependencies
<!-- </section:validation-rules> -->

<!-- <section:ai-agent-behavior> -->
## AI Agent Behavior

### Typical Codemap Usage Workflow

When working with codemaps, AI agents SHOULD follow this standard workflow:

#### 1. Locate the Project Map
- Read `codemaps/projectmap.md` to understand overall project architecture
- Identify relevant technology stack and patterns
- Understand directory structure and conventions

#### 2. List All Codemaps
- Scan `codemaps/` directory for existing feature documentation
- Review codemap filenames to identify potentially relevant features
- Note codemap naming patterns and organizational structure

#### 3. Decide on Codemap Action
Based on filename and contents, determine ONE of:

**a) Creating a New Codemap**
- Feature does not exist in codebase
- No existing codemap matches the user's request
- Use `codemaps/templates/template.codemap.md` as starting point
- Follow naming convention: `$featurename.codemap.md`

**b) Updating an Existing Codemap**
- Feature exists and has an associated codemap
- User requests modifications to existing feature
- Changes require documentation updates
- Review current state before planning modifications

**c) Referencing a Codemap (No Update Required)**
- Codemap accurately reflects current implementation
- User request is for information or understanding only
- Implementation changes are not needed
- Use codemap as reference to answer questions

#### 4. Determine User's Goal and Work Proactively
After deciding on codemap action, proceed without further prompting:

- **For new codemaps**: Create codemap structure, plan implementation, and apply changes
- **For updates**: Modify codemap to reflect planned changes, then implement
- **For reference**: Use codemap information to provide answers or guidance

Key principles:
- Execute the complete workflow autonomously
- Use codemaps as source of truth for implementation
- Maintain consistency with established patterns
- Document all architectural decisions

#### 5. Ask Clarification Questions (After Implementation)
ONLY after completing initial implementation:

- Identify ambiguities or edge cases discovered during work
- Ask targeted questions about specific decisions
- Request feedback on implementation approach
- Iterate based on user responses

Important:
- Do NOT ask clarifying questions upfront unless absolutely necessary
- Take initiative and make reasonable decisions based on context
- Prefer action over prolonged planning discussions
- Use codemaps to reduce ambiguity and decision paralysis
<!-- </section:ai-agent-behavior> -->
