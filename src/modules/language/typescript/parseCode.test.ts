/**
 * Tests for TypeScript/JavaScript code parser
 */

import { test, expect, describe } from 'bun:test';
import { parseCode, generateChunkId, type ParsedChunk } from './parseCode';

describe('parseCode', () => {
  describe('TypeScript function detection', () => {
    test('detects regular function declarations', () => {
      const code = `
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
`;
      const chunks = parseCode(code, 'test.ts');
      
      expect(chunks.length).toBe(1);
      expect(chunks[0].type).toBe('function');
      expect(chunks[0].name).toBe('greet');
      expect(chunks[0].isExported).toBe(true);
    });

    test('detects async function declarations', () => {
      const code = `
export async function fetchData(url: string): Promise<Response> {
  return await fetch(url);
}
`;
      const chunks = parseCode(code, 'test.ts');
      
      expect(chunks.length).toBe(1);
      expect(chunks[0].type).toBe('function');
      expect(chunks[0].name).toBe('fetchData');
      expect(chunks[0].isExported).toBe(true);
    });

    test('detects arrow functions assigned to const', () => {
      const code = `
export const add = (a: number, b: number): number => a + b;
`;
      const chunks = parseCode(code, 'test.ts');
      
      expect(chunks.length).toBe(1);
      expect(chunks[0].type).toBe('function');
      expect(chunks[0].name).toBe('add');
      expect(chunks[0].isExported).toBe(true);
    });

    test('detects async arrow functions', () => {
      const code = `
export const fetchUser = async (id: string): Promise<User> => {
  const response = await fetch(\`/users/\${id}\`);
  return response.json();
};
`;
      const chunks = parseCode(code, 'test.ts');
      
      expect(chunks.length).toBe(1);
      expect(chunks[0].type).toBe('function');
      expect(chunks[0].name).toBe('fetchUser');
    });

    test('detects non-exported functions', () => {
      const code = `
function helper(x: number): number {
  return x * 2;
}
`;
      const chunks = parseCode(code, 'test.ts');
      
      expect(chunks.length).toBe(1);
      expect(chunks[0].type).toBe('function');
      expect(chunks[0].name).toBe('helper');
      expect(chunks[0].isExported).toBe(false);
    });
  });

  describe('TypeScript class detection', () => {
    test('detects class declarations', () => {
      const code = `
export class UserService {
  private users: User[] = [];

  addUser(user: User): void {
    this.users.push(user);
  }

  getUser(id: string): User | undefined {
    return this.users.find(u => u.id === id);
  }
}
`;
      const chunks = parseCode(code, 'test.ts');
      
      expect(chunks.length).toBe(1);
      expect(chunks[0].type).toBe('class');
      expect(chunks[0].name).toBe('UserService');
      expect(chunks[0].isExported).toBe(true);
    });

    test('detects abstract classes', () => {
      const code = `
export abstract class BaseRepository<T> {
  abstract find(id: string): Promise<T | null>;
  abstract save(entity: T): Promise<void>;
}
`;
      const chunks = parseCode(code, 'test.ts');
      
      expect(chunks.length).toBe(1);
      expect(chunks[0].type).toBe('class');
      expect(chunks[0].name).toBe('BaseRepository');
    });
  });

  describe('TypeScript interface detection', () => {
    test('detects interface declarations', () => {
      const code = `
export interface User {
  id: string;
  name: string;
  email: string;
}
`;
      const chunks = parseCode(code, 'test.ts');
      
      expect(chunks.length).toBe(1);
      expect(chunks[0].type).toBe('interface');
      expect(chunks[0].name).toBe('User');
      expect(chunks[0].isExported).toBe(true);
    });

    test('detects interfaces with extends', () => {
      const code = `
export interface AdminUser extends User {
  role: 'admin';
  permissions: string[];
}
`;
      const chunks = parseCode(code, 'test.ts');
      
      expect(chunks.length).toBe(1);
      expect(chunks[0].type).toBe('interface');
      expect(chunks[0].name).toBe('AdminUser');
    });
  });

  describe('TypeScript type detection', () => {
    test('detects type aliases', () => {
      const code = `
export type UserRole = 'admin' | 'user' | 'guest';
`;
      const chunks = parseCode(code, 'test.ts');
      
      expect(chunks.length).toBe(1);
      expect(chunks[0].type).toBe('type');
      expect(chunks[0].name).toBe('UserRole');
      expect(chunks[0].isExported).toBe(true);
    });

    test('detects complex type aliases', () => {
      const code = `
export type ApiResponse<T> = {
  data: T;
  status: number;
  message?: string;
};
`;
      const chunks = parseCode(code, 'test.ts');
      
      expect(chunks.length).toBe(1);
      expect(chunks[0].type).toBe('type');
      expect(chunks[0].name).toBe('ApiResponse');
    });
  });

  describe('TypeScript enum detection', () => {
    test('detects enum declarations', () => {
      const code = `
export enum Status {
  Pending = 'pending',
  Active = 'active',
  Inactive = 'inactive'
}
`;
      const chunks = parseCode(code, 'test.ts');
      
      expect(chunks.length).toBe(1);
      expect(chunks[0].type).toBe('enum');
      expect(chunks[0].name).toBe('Status');
      expect(chunks[0].isExported).toBe(true);
    });

    test('detects const enum', () => {
      const code = `
export const enum Direction {
  Up,
  Down,
  Left,
  Right
}
`;
      const chunks = parseCode(code, 'test.ts');
      
      expect(chunks.length).toBe(1);
      expect(chunks[0].type).toBe('enum');
      expect(chunks[0].name).toBe('Direction');
    });
  });

  describe('multiple declarations', () => {
    test('detects multiple declarations in one file', () => {
      const code = `
export interface User {
  id: string;
  name: string;
}

export type UserRole = 'admin' | 'user';

export function createUser(name: string): User {
  return { id: crypto.randomUUID(), name };
}

export class UserService {
  private users: User[] = [];
}
`;
      const chunks = parseCode(code, 'test.ts');
      
      expect(chunks.length).toBe(4);
      
      const types = chunks.map(c => c.type);
      expect(types).toContain('interface');
      expect(types).toContain('type');
      expect(types).toContain('function');
      expect(types).toContain('class');
    });
  });

  describe('line number accuracy', () => {
    test('reports correct line numbers', () => {
      const code = `// Comment line 1
// Comment line 2

export function test(): void {
  console.log('hello');
}
`;
      const chunks = parseCode(code, 'test.ts');
      
      expect(chunks.length).toBe(1);
      expect(chunks[0].startLine).toBe(4);
      expect(chunks[0].endLine).toBe(6);
    });
  });

  describe('fallback for non-TS files', () => {
    test('uses generic chunking for .py files', () => {
      const code = `def greet(name):
    return f"Hello, {name}!"

class User:
    def __init__(self, name):
        self.name = name
`;
      const chunks = parseCode(code, 'test.py');
      
      // Should fall back to file-level chunk for small files
      expect(chunks.length).toBe(1);
      expect(chunks[0].type).toBe('file');
    });

    test('uses block chunking for large non-TS files', () => {
      // Create a large file (more than 30 lines)
      const lines = Array(50).fill('# Line of code').join('\n');
      const chunks = parseCode(lines, 'test.py');
      
      // Should create multiple block chunks
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].type).toBe('block');
    });
  });

  describe('JSX/TSX support', () => {
    test('handles TSX files', () => {
      const code = `
export function Button({ onClick, children }: ButtonProps) {
  return <button onClick={onClick}>{children}</button>;
}
`;
      const chunks = parseCode(code, 'Button.tsx');
      
      expect(chunks.length).toBe(1);
      expect(chunks[0].type).toBe('function');
      expect(chunks[0].name).toBe('Button');
    });
  });
});

describe('generateChunkId', () => {
  test('generates unique ID from filepath and lines', () => {
    const id = generateChunkId('src/auth/login.ts', 10, 25);
    expect(id).toBe('src-auth-login_ts-10-25');
  });

  test('handles Windows-style paths', () => {
    const id = generateChunkId('src\\auth\\login.ts', 10, 25);
    expect(id).toBe('src-auth-login_ts-10-25');
  });

  test('handles dots in filename', () => {
    const id = generateChunkId('src/config.test.ts', 1, 10);
    expect(id).toBe('src-config_test_ts-1-10');
  });
});


