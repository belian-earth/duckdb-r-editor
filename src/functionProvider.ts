import * as vscode from 'vscode';
import * as duckdb from 'duckdb';
import { DuckDBFunction } from './types';

/**
 * Provides DuckDB function discovery using Node.js DuckDB bindings
 * Uses in-memory database to query duckdb_functions() system table
 */
export class DuckDBFunctionProvider implements vscode.Disposable {
    private db: duckdb.Database | null = null;
    private connection: duckdb.Connection | null = null;
    private functions: Map<string, DuckDBFunction> = new Map();
    private loadedExtensions: Set<string> = new Set();

    constructor() {
        // Initialize in-memory database for function discovery
        this.initialize();
    }

    private initialize(): void {
        this.db = new duckdb.Database(':memory:');
        this.connection = this.db.connect();
    }

    /**
     * Discover all available DuckDB functions
     */
    async refreshFunctions(): Promise<void> {
        if (!this.connection) {
            console.error('No database connection for function discovery');
            return;
        }

        try {
            // Load any registered extensions first
            if (this.loadedExtensions.size > 0) {
                for (const ext of this.loadedExtensions) {
                    await this.query(`INSTALL ${ext}`);
                    await this.query(`LOAD ${ext}`);
                }
            }

            // Query all functions
            const results = await this.query<{
                function_name: string;
                function_type: string;
                description: string;
                return_type: string;
                parameters: string;
                parameter_types: string;
            }>(`
                SELECT
                    function_name,
                    function_type,
                    description,
                    return_type,
                    parameters,
                    parameter_types
                FROM duckdb_functions()
                ORDER BY function_name
            `);

            this.functions.clear();
            for (const row of results) {
                this.functions.set(row.function_name.toLowerCase(), {
                    function_name: row.function_name,
                    function_type: row.function_type,
                    description: row.description,
                    return_type: row.return_type,
                    parameters: row.parameters,
                    parameter_types: row.parameter_types
                });
            }

            // Function discovery complete
        } catch (error) {
            console.error('Failed to refresh functions:', error);
        }
    }

    /**
     * Load an official DuckDB extension for function discovery
     * Note: Only supports official extensions. For community extensions,
     * load them in your R session and they will be picked up via hybrid provider.
     * @param extensionName Name of the official extension to load
     */
    async loadExtension(extensionName: string): Promise<void> {
        if (!this.connection) {
            throw new Error('No database connection');
        }

        try {
            await this.query(`INSTALL ${extensionName}`);
            await this.query(`LOAD ${extensionName}`);

            this.loadedExtensions.add(extensionName);

            // Refresh functions to include extension functions
            await this.refreshFunctions();
        } catch (error: any) {
            throw new Error(`Failed to load extension '${extensionName}': ${error.message}`);
        }
    }

    /**
     * Load multiple extensions from settings
     */
    async loadDefaultExtensions(extensionNames: string[]): Promise<void> {
        if (extensionNames.length === 0) {
            return;
        }

        const errors: string[] = [];

        for (const extensionName of extensionNames) {
            try {
                await this.query(`INSTALL ${extensionName}`);
                await this.query(`LOAD ${extensionName}`);
                this.loadedExtensions.add(extensionName);
            } catch (error: any) {
                errors.push(`Failed to load '${extensionName}': ${error.message}`);
            }
        }

        // Refresh functions after loading all extensions
        await this.refreshFunctions();

        if (errors.length > 0) {
            console.warn(`Some extensions failed to load:\n${errors.join('\n')}`);
        }
    }

    /**
     * Merge R functions with Node.js functions
     * R functions take precedence (source of truth when connected)
     */
    mergeRFunctions(rFunctions: any[]): void {
        if (!rFunctions || rFunctions.length === 0) {
            return;
        }

        for (const rFunc of rFunctions) {
            const funcName = rFunc.function_name?.toLowerCase();
            if (!funcName) continue;

            // Convert R function to DuckDBFunction format
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

    /**
     * Get all function names
     */
    getFunctionNames(): string[] {
        return Array.from(this.functions.keys());
    }

    /**
     * Get function metadata
     */
    getFunction(name: string): DuckDBFunction | undefined {
        return this.functions.get(name.toLowerCase());
    }

    /**
     * Get all functions (for bulk operations)
     */
    getAllFunctions(): DuckDBFunction[] {
        return Array.from(this.functions.values());
    }

    /**
     * Execute a query on the in-memory database
     */
    private query<T = any>(sql: string): Promise<T[]> {
        return new Promise((resolve, reject) => {
            if (!this.connection) {
                reject(new Error('No database connection'));
                return;
            }

            this.connection.all(sql, (err: Error | null, rows: any[]) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows as T[]);
                }
            });
        });
    }

    dispose() {
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }

        if (this.db) {
            this.db.close();
            this.db = null;
        }

        this.functions.clear();
        this.loadedExtensions.clear();
    }
}
