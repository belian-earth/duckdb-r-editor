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
    private positronApi: any;

    constructor(positronApi?: any) {
        this.positronApi = positronApi;
    }

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

        // In Positron, try querying R session FIRST to avoid file locks
        if (this.positronApi) {
            console.log('Positron API available - checking for active R DuckDB connections first...');
            try {
                await this.refreshSchemaViaPositronR();
                console.log('✓ Successfully got schema from R session - no file access needed!');
                return; // Success! No need to touch the file
            } catch (positronError: any) {
                console.log(`R session query failed: ${positronError.message}`);
                console.log('Falling back to direct file access...');
                // Continue to try file access below
            }
        }

        try {
            // Use ATTACH with DuckDB system functions for better concurrent access
            // The duckdb_columns() function works better than information_schema
            // when the database has an active write connection (e.g., from R)
            const query = `
                ATTACH '${this.dbPath}' AS target_db (READ_ONLY);
                SELECT
                    table_name,
                    column_name,
                    data_type,
                    CASE WHEN is_nullable THEN 'YES' ELSE 'NO' END as is_nullable
                FROM duckdb_columns()
                WHERE database_name = 'target_db'
                  AND schema_name = 'main'
                ORDER BY table_name, column_index;
            `;

            const command = `duckdb :memory: -json -c "${query.replace(/"/g, '\\"')}"`;
            console.log(`Executing schema query with ATTACH + duckdb_columns(): ${command}`);

            const { stdout, stderr } = await execAsync(
                command,
                { maxBuffer: 10 * 1024 * 1024 }
            );

            if (stderr) {
                console.log(`Schema query stderr: ${stderr}`);
            }

            if (!stdout.trim()) {
                console.log('No schema information returned');
                console.log(`Query was: ${query}`);
                console.log(`Database path: ${this.dbPath}`);
                return;
            }

            console.log(`Schema query returned ${stdout.length} bytes`);
            const results = JSON.parse(stdout);
            console.log(`Parsed ${results.length} column rows`);

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

            // If we get a lock error, try querying through Positron R session
            if (error.message && error.message.includes('Conflicting lock')) {
                console.log('Database is locked - attempting to query schema through R session...');
                try {
                    await this.refreshSchemaViaPositronR();
                    return;
                } catch (positronError: any) {
                    console.error('Failed to query through Positron R session:', positronError);
                    throw new Error(`Database is locked by another process. Unable to read schema. Close other connections or disconnect from R first. Original error: ${error.message}`);
                }
            }
            throw error;
        }
    }

    /**
     * Fallback: Query schema through Positron's R runtime when file is locked
     */
    private async refreshSchemaViaPositronR(): Promise<void> {
        if (!this.positronApi) {
            throw new Error('Positron API not available');
        }

        console.log('Using Positron API to query R session...');

        // R code to get all DuckDB connections and their schemas
        const rCode = `
tryCatch({
    # Find all DuckDB connections in global environment
    all_objs <- ls(envir = .GlobalEnv)
    connections <- list()

    for (obj_name in all_objs) {
        obj <- get(obj_name, envir = .GlobalEnv)
        if (inherits(obj, "duckdb_connection")) {
            connections[[obj_name]] <- obj
        }
    }

    if (length(connections) == 0) {
        stop("No DuckDB connections found in R session")
    }

    # Use the first connection
    con <- connections[[1]]

    # Get schema information
    if (!requireNamespace("DBI", quietly = TRUE)) {
        stop("DBI package not available")
    }

    tables <- DBI::dbListTables(con)
    result <- list()

    for (table in tables) {
        tryCatch({
            col_info <- DBI::dbGetQuery(con, sprintf(
                "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '%s' AND table_schema = 'main' ORDER BY ordinal_position",
                table
            ))

            for (i in 1:nrow(col_info)) {
                result[[length(result) + 1]] <- list(
                    table_name = table,
                    column_name = col_info$column_name[i],
                    data_type = col_info$data_type[i],
                    is_nullable = col_info$is_nullable[i]
                )
            }
        }, error = function(e) {
            # Silently skip tables that can't be queried
        })
    }

    if (length(result) == 0) {
        stop("No columns found")
    }

    # Return as JSON
    json_output <- if (requireNamespace("jsonlite", quietly = TRUE)) {
        jsonlite::toJSON(result, auto_unbox = TRUE)
    } else {
        paste0("[", paste(sapply(result, function(r) {
            sprintf('{"table_name":"%s","column_name":"%s","data_type":"%s","is_nullable":"%s"}',
                r$table_name, r$column_name, r$data_type, r$is_nullable)
        }), collapse = ","), "]")
    }

    cat("__JSON_START__\\n")
    cat(json_output)
    cat("\\n__JSON_END__\\n")
    cat("✓ DuckDB R Editor: Schema retrieved from active R session\\n")
}, error = function(e) {
    stop(e$message)
})
        `.trim();

        try {
            // Execute R code through Positron using observer pattern to capture output
            let output = '';
            let errorOutput = '';

            await this.positronApi.runtime.executeCode(
                'r',           // Language ID
                rCode,         // Code to execute
                false,         // Don't focus console
                false,         // Allow incomplete code
                'transient',   // Transient mode - allows output capture without history
                undefined,     // Use default error behavior
                {
                    onOutput: (text: string) => {
                        output += text;
                        console.log('R output received:', text);
                    },
                    onError: (text: string) => {
                        errorOutput += text;
                        console.log('R error received:', text);
                    },
                    onFinished: () => {
                        console.log('R execution finished');
                    }
                }
            );

            console.log('Full R output:', output);
            console.log('Full R error output:', errorOutput);

            if (!output || output.trim().length === 0) {
                const errorMsg = errorOutput || 'No output from R execution';
                throw new Error(errorMsg);
            }

            // Extract JSON between __JSON_START__ and __JSON_END__ markers
            const jsonStartMarker = '__JSON_START__';
            const jsonEndMarker = '__JSON_END__';
            const startIndex = output.indexOf(jsonStartMarker);
            const endIndex = output.indexOf(jsonEndMarker);

            if (startIndex === -1 || endIndex === -1) {
                throw new Error(`Could not find JSON markers in R output: ${output}`);
            }

            const jsonStr = output.substring(startIndex + jsonStartMarker.length, endIndex).trim();
            console.log('Extracted JSON, length:', jsonStr.length);

            // Parse the JSON result
            const schemaData = JSON.parse(jsonStr);
            console.log('Parsed schema data:', schemaData.length, 'columns');

            this.schema.clear();
            for (const row of schemaData) {
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

            console.log(`✓ Discovered ${this.schema.size} tables from R session (via Positron API)`);
        } catch (error: any) {
            throw new Error(`Failed to query R session: ${error.message}`);
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
