import * as vscode from 'vscode';
import { DuckDBFunction } from './types';

// esbuild inlines this JSON into the bundle at build time.
// The try-catch is a safety net for running unbundled during development.
let baseFunctions: DuckDBFunction[] = [];
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    baseFunctions = require('../data/duckdb-functions.json');
} catch (err) {
    console.error('Failed to load bundled DuckDB function list:', err);
}

/**
 * Provides DuckDB function metadata for autocomplete.
 * Loads a pre-generated static list of base functions, then merges
 * any additional functions discovered from the R session at runtime.
 */
export class DuckDBFunctionProvider implements vscode.Disposable {
    private functions: Map<string, DuckDBFunction> = new Map();

    constructor() {
        for (const func of baseFunctions) {
            this.functions.set(func.function_name.toLowerCase(), func);
        }
    }

    /**
     * Merge R functions with base functions.
     * R functions take precedence (source of truth when connected).
     */
    mergeRFunctions(rFunctions: any[]): void {
        if (!rFunctions || rFunctions.length === 0) {
            return;
        }

        for (const rFunc of rFunctions) {
            const funcName = rFunc.function_name?.toLowerCase();
            if (!funcName) {
                continue;
            }

            this.functions.set(funcName, {
                function_name: rFunc.function_name,
                function_type: rFunc.function_type || 'scalar',
                description: rFunc.description || '',
                return_type: rFunc.return_type || '',
                parameters: rFunc.parameters || '',
                parameter_types: rFunc.parameter_types || ''
            });
        }
    }

    getFunctionNames(): string[] {
        return Array.from(this.functions.keys());
    }

    getFunction(name: string): DuckDBFunction | undefined {
        return this.functions.get(name.toLowerCase());
    }

    getAllFunctions(): DuckDBFunction[] {
        return Array.from(this.functions.values());
    }

    dispose() {
        this.functions.clear();
    }
}
