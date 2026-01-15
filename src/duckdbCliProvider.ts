import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ColumnInfo, DuckDBFunction } from './types';

const execAsync = promisify(exec);

/**
 * Provides DuckDB functionality via CLI
 * This approach is database-agnostic and works with any DuckDB version
 */
export class DuckDBCliProvider implements vscode.Disposable {
    private dbPath: string | null = null;
    private functions: Map<string, DuckDBFunction> = new Map();
    private schema: Map<string, ColumnInfo[]> = new Map();
    private cliAvailable: boolean | null = null;

    /**
     * Check if DuckDB CLI is available on the system
     */
    async isDuckDBCliAvailable(): Promise<boolean> {
        if (this.cliAvailable !== null) {
            return this.cliAvailable;
        }

        try {
            const { stdout } = await execAsync('duckdb --version');
            console.log('DuckDB CLI version:', stdout.trim());
            this.cliAvailable = true;
            return true;
        } catch (error) {
            console.log('DuckDB CLI not available:', error);
            this.cliAvailable = false;
            return false;
        }
    }

    /**
     * Set the database path
     */
    async connect(dbPath: string): Promise<void> {
        if (!await this.isDuckDBCliAvailable()) {
            throw new Error('DuckDB CLI is not available. Please install DuckDB: https://duckdb.org/docs/installation/');
        }

        this.dbPath = dbPath;
        console.log('Connected to DuckDB database:', dbPath);

        // Immediately fetch functions and schema
        await this.refreshFunctions();
        await this.refreshSchema();
    }

    /**
     * Execute a query and return results as JSON
     */
    async executeQuery(query: string): Promise<any[]> {
        if (!this.dbPath) {
            throw new Error('No database connected');
        }

        try {
            // Use -json flag to get JSON output, -readonly to avoid lock conflicts
            const { stdout } = await execAsync(
                `duckdb "${this.dbPath}" -readonly -json -c "${query.replace(/"/g, '\\"')}"`,
                { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for large results
            );

            if (!stdout.trim()) {
                return [];
            }

            return JSON.parse(stdout);
        } catch (error: any) {
            throw new Error(`Query failed: ${error.message}`);
        }
    }

    /**
     * Load extensions for function discovery
     */
    private loadedExtensions: Set<string> = new Set();

    /**
     * Load an extension in the introspection database for function discovery
     */
    async loadExtensionForAutocomplete(extensionName: string): Promise<void> {
        try {
            console.log(`Loading extension '${extensionName}' for autocomplete...`);

            // Install and load the extension in memory database
            const installQuery = `INSTALL ${extensionName}; LOAD ${extensionName};`;
            await execAsync(
                `duckdb :memory: -c "${installQuery}"`,
                { maxBuffer: 10 * 1024 * 1024 }
            );

            this.loadedExtensions.add(extensionName);
            console.log(`✓ Extension '${extensionName}' loaded for autocomplete`);

            // Refresh functions to include extension functions
            await this.refreshFunctions();
        } catch (error: any) {
            console.error(`Failed to load extension '${extensionName}':`, error.message);
            throw new Error(`Failed to load extension '${extensionName}': ${error.message}`);
        }
    }

    /**
     * Dynamically discover all functions from DuckDB
     * This includes built-in functions AND extension functions
     *
     * Uses :memory: database to avoid lock conflicts with user's database
     */
    async refreshFunctions(): Promise<void> {
        try {
            // Build command that loads extensions first, then queries functions
            let command = '';

            // Load all registered extensions
            if (this.loadedExtensions.size > 0) {
                const extensions = Array.from(this.loadedExtensions);
                for (const ext of extensions) {
                    command += `INSTALL ${ext}; LOAD ${ext}; `;
                }
            }

            // Query functions
            command += `
                SELECT
                    function_name,
                    function_type,
                    description,
                    return_type,
                    parameters,
                    parameter_types
                FROM duckdb_functions()
                ORDER BY function_name;
            `;

            // Use in-memory database to query functions (avoids lock conflicts)
            const { stdout } = await execAsync(
                `duckdb :memory: -json -c "${command.replace(/"/g, '\\"')}"`,
                { maxBuffer: 10 * 1024 * 1024 }
            );

            if (!stdout.trim()) {
                console.log('No functions returned from DuckDB');
                return;
            }

            const results = JSON.parse(stdout);

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

            const extInfo = this.loadedExtensions.size > 0
                ? ` (including extensions: ${Array.from(this.loadedExtensions).join(', ')})`
                : '';
            console.log(`Discovered ${this.functions.size} functions from DuckDB${extInfo}`);
        } catch (error) {
            console.error('Failed to refresh functions:', error);
        }
    }

    /**
     * Dynamically discover schema from information_schema
     * Uses ATTACH with READ_ONLY to avoid lock conflicts with R session
     */
    async refreshSchema(): Promise<void> {
        if (!this.dbPath) {
            console.log('No database connected, skipping schema refresh');
            return;
        }

        try {
            // Use ATTACH in :memory: database to read schema without locking
            // This works even when R session has the database open!
            const query = `
                ATTACH '${this.dbPath}' AS db (READ_ONLY);
                SELECT
                    table_name,
                    column_name,
                    data_type,
                    is_nullable
                FROM information_schema.columns
                WHERE table_catalog = 'db'
                ORDER BY table_name, ordinal_position;
            `;

            const { stdout } = await execAsync(
                `duckdb :memory: -json -c "${query.replace(/"/g, '\\"')}"`,
                { maxBuffer: 10 * 1024 * 1024 }
            );

            if (!stdout.trim()) {
                console.log('No schema information returned');
                return;
            }

            const results = JSON.parse(stdout);

            this.schema.clear();
            for (const row of results) {
                const tableName = row.table_name;
                if (!this.schema.has(tableName)) {
                    this.schema.set(tableName, []);
                }

                this.schema.get(tableName)!.push({
                    name: row.column_name,
                    type: row.data_type,
                    nullable: row.is_nullable === 'YES'
                });
            }

            console.log(`Discovered ${this.schema.size} tables from database schema (using ATTACH READ_ONLY)`);
        } catch (error: any) {
            console.error('Failed to refresh schema:', error);
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
     * Get table names
     */
    getTableNames(): string[] {
        return Array.from(this.schema.keys());
    }

    /**
     * Get columns for a table
     */
    getColumns(tableName: string): ColumnInfo[] {
        return this.schema.get(tableName) || [];
    }

    /**
     * Get all columns from all tables
     */
    getAllColumns(): Array<{ table: string; column: ColumnInfo }> {
        const result: Array<{ table: string; column: ColumnInfo }> = [];
        for (const [table, columns] of this.schema.entries()) {
            for (const column of columns) {
                result.push({ table, column });
            }
        }
        return result;
    }

    /**
     * Check if connected to a database
     */
    isConnected(): boolean {
        return this.dbPath !== null;
    }

    /**
     * Get current database path
     */
    getDatabasePath(): string | null {
        return this.dbPath;
    }

    dispose() {
        this.dbPath = null;
        this.functions.clear();
        this.schema.clear();
    }
}
