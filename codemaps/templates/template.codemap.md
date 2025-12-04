# [Feature Name] Codemap

## Description

Brief explanation of what this feature accomplishes and its purpose.

## Sequence Diagram

```plantuml
@startuml
participant "Layer1" as L1
participant "Layer2" as L2
participant "Layer3" as L3

L1 -> L2: functionName(params: ParamType): ReturnType
L2 -> L3: anotherFunction(args: ArgType): ResultType
L3 --> L2: result
L2 --> L1: finalResult
@enduml
```

## Files

### Domain Layer

#### Entities

- `src/domain/entities/feature.ts` - Entity definitions

#### Services

- `src/domain/services/feature.ts` - Pure algorithms

#### Ports

- `src/domain/ports/feature.ts` - Interface definitions

### Infrastructure Layer

- `src/infrastructure/feature/implementation.ts` - I/O implementations

### Application Layer

- `src/app/feature/index.ts` - Orchestration

## Contracts

### Key Interfaces

```typescript
interface ExampleInterface {
  field: string;
}
```

## Integration Points

1. Where this feature connects to existing code
2. Entry points and exit points

## Notes

Additional context or considerations.
