declare module 'bun:test' {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function expect(value: any): {
    toBe(expected: any): void;
    toBeDefined(): void;
    toEqual(expected: any): void;
    toContain(expected: any): void;
    toBeCloseTo(expected: number, precision?: number): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toHaveLength(expected: number): void;
    toHaveProperty(path: string, value?: any): void;
  };
}
