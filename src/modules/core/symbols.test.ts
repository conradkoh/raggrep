/**
 * Tests for regex-based symbol extraction
 */

import { test, expect, describe } from "bun:test";
import { extractSymbols, symbolsToKeywords } from "./symbols";

describe("extractSymbols", () => {
  describe("TypeScript/JavaScript", () => {
    test("extracts exported function declarations", () => {
      const content = `export function login(email: string): void {}`;
      const symbols = extractSymbols(content);
      
      expect(symbols).toHaveLength(1);
      expect(symbols[0]).toEqual({
        name: "login",
        type: "function",
        line: 1,
        isExported: true,
      });
    });

    test("extracts exported async functions", () => {
      const content = `export async function fetchData(): Promise<void> {}`;
      const symbols = extractSymbols(content);
      
      expect(symbols).toHaveLength(1);
      expect(symbols[0].name).toBe("fetchData");
      expect(symbols[0].type).toBe("function");
      expect(symbols[0].isExported).toBe(true);
    });

    test("extracts exported arrow functions", () => {
      const content = `export const handler = (req: Request) => {}`;
      const symbols = extractSymbols(content);
      
      // May match both as function and variable pattern - verify handler is found
      expect(symbols.length).toBeGreaterThanOrEqual(1);
      const handlerSymbol = symbols.find(s => s.name === "handler");
      expect(handlerSymbol).toBeDefined();
      expect(handlerSymbol!.isExported).toBe(true);
    });

    test("extracts exported classes", () => {
      const content = `export class UserService {}`;
      const symbols = extractSymbols(content);
      
      expect(symbols).toHaveLength(1);
      expect(symbols[0]).toEqual({
        name: "UserService",
        type: "class",
        line: 1,
        isExported: true,
      });
    });

    test("extracts exported interfaces", () => {
      const content = `export interface User { id: string; }`;
      const symbols = extractSymbols(content);
      
      expect(symbols).toHaveLength(1);
      expect(symbols[0].name).toBe("User");
      expect(symbols[0].type).toBe("interface");
    });

    test("extracts exported types", () => {
      const content = `export type UserRole = 'admin' | 'user';`;
      const symbols = extractSymbols(content);
      
      expect(symbols).toHaveLength(1);
      expect(symbols[0].name).toBe("UserRole");
      expect(symbols[0].type).toBe("type");
    });

    test("extracts exported enums", () => {
      const content = `export enum Status { Active, Inactive }`;
      const symbols = extractSymbols(content);
      
      expect(symbols).toHaveLength(1);
      expect(symbols[0].name).toBe("Status");
      expect(symbols[0].type).toBe("enum");
    });

    test("extracts non-exported functions", () => {
      const content = `function helperFn() {}`;
      const symbols = extractSymbols(content);
      
      expect(symbols).toHaveLength(1);
      expect(symbols[0].name).toBe("helperFn");
      expect(symbols[0].isExported).toBe(false);
    });

    test("extracts multiple symbols with correct line numbers", () => {
      const content = `
export interface User {
  id: string;
}

export class UserService {
  getUser() {}
}

function helper() {}
      `.trim();
      
      const symbols = extractSymbols(content);
      
      expect(symbols).toHaveLength(3);
      expect(symbols[0].name).toBe("User");
      expect(symbols[0].line).toBe(1);
      expect(symbols[1].name).toBe("UserService");
      expect(symbols[1].line).toBe(5);
      expect(symbols[2].name).toBe("helper");
      expect(symbols[2].line).toBe(9);
    });
  });

  describe("Python", () => {
    test("extracts function definitions", () => {
      const content = `def calculate_total(items):
    return sum(items)`;
      const symbols = extractSymbols(content);
      
      expect(symbols.some(s => s.name === "calculate_total")).toBe(true);
    });

    test("extracts class definitions", () => {
      const content = `class DatabaseConnection:
    def __init__(self):
        pass`;
      const symbols = extractSymbols(content);
      
      expect(symbols.some(s => s.name === "DatabaseConnection" && s.type === "class")).toBe(true);
    });
  });

  describe("Go", () => {
    test("extracts function definitions", () => {
      const content = `func HandleRequest(w http.ResponseWriter, r *http.Request) {}`;
      const symbols = extractSymbols(content);
      
      expect(symbols.some(s => s.name === "HandleRequest")).toBe(true);
    });

    test("extracts type definitions", () => {
      const content = `type User struct {
    ID   string
    Name string
}`;
      const symbols = extractSymbols(content);
      
      expect(symbols.some(s => s.name === "User" && s.type === "type")).toBe(true);
    });
  });

  describe("Rust", () => {
    test("extracts function definitions", () => {
      const content = `pub fn process_data(input: &str) -> Result<()> {}`;
      const symbols = extractSymbols(content);
      
      expect(symbols.some(s => s.name === "process_data")).toBe(true);
    });

    test("extracts struct definitions", () => {
      const content = `pub struct Config {
    pub port: u16,
}`;
      const symbols = extractSymbols(content);
      
      expect(symbols.some(s => s.name === "Config")).toBe(true);
    });
  });
});

describe("symbolsToKeywords", () => {
  test("converts symbols to lowercase keywords", () => {
    const symbols = [
      { name: "UserService", type: "class" as const, line: 1, isExported: true },
    ];
    
    const keywords = symbolsToKeywords(symbols);
    
    expect(keywords).toContain("userservice");
  });

  test("splits camelCase into parts", () => {
    const symbols = [
      { name: "getUserById", type: "function" as const, line: 1, isExported: true },
    ];
    
    const keywords = symbolsToKeywords(symbols);
    
    expect(keywords).toContain("get");
    expect(keywords).toContain("user");
  });

  test("splits PascalCase into parts", () => {
    const symbols = [
      { name: "UserRepository", type: "class" as const, line: 1, isExported: true },
    ];
    
    const keywords = symbolsToKeywords(symbols);
    
    expect(keywords).toContain("user");
    expect(keywords).toContain("repository");
  });

  test("handles acronyms in names", () => {
    const symbols = [
      { name: "APIController", type: "class" as const, line: 1, isExported: true },
    ];
    
    const keywords = symbolsToKeywords(symbols);
    
    expect(keywords).toContain("api");
    expect(keywords).toContain("controller");
  });

  test("filters out short parts", () => {
    const symbols = [
      { name: "getID", type: "function" as const, line: 1, isExported: true },
    ];
    
    const keywords = symbolsToKeywords(symbols);
    
    expect(keywords).toContain("get");
    // "id" is only 2 chars, should be filtered
    expect(keywords).not.toContain("id");
  });
});

