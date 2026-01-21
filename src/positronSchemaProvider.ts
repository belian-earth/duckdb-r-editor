import * as vscode from 'vscode';
import { ColumnInfo } from './types';
import * as os from 'os';
import * as path from 'path';

/**
 * Provides DuckDB schema by querying active R session via Positron API
 * Uses file-based storage with silent execution (no console pollution)
 */
export class PositronSchemaProvider implements vscode.Disposable {
    private schema: Map<string, ColumnInfo[]> = new Map();
    private connectionName: string | null = null;
    private dbPath: string | null = null;
    private positronApi: any;
    private schemaFilePath: string | null = null;
    private functionsFilePath: string | null = null;
    private rFunctions: any[] = [];

    constructor(positronApi: any) {
        if (!positronApi) {
            throw new Error('Positron API is required for PositronSchemaProvider');
        }
        this.positronApi = positronApi;
    }

    /**
     * Connect to a specific R DuckDB connection
     */
    async connect(connectionName: string, dbPath: string): Promise<void> {
        // SECURITY: Validate connection name to prevent code injection
        // R identifiers must start with letter or dot (not followed by number)
        // and contain only letters, numbers, dots, and underscores
        if (!/^[a-zA-Z][a-zA-Z0-9._]*$/.test(connectionName)) {
            throw new Error(
                `Invalid connection name: "${connectionName}". ` +
                `R connection names must start with a letter and contain only letters, numbers, dots, and underscores.`
            );
        }

        this.connectionName = connectionName;
        this.dbPath = dbPath;

        // Create temp files for schema and functions
        const tmpDir = os.tmpdir();
        const timestamp = Date.now();
        // Use safe, validated connection name in file path
        const safeConnectionName = connectionName.replace(/[^a-zA-Z0-9._]/g, '_');
        this.schemaFilePath = path.join(tmpDir, `duckdb-schema-${safeConnectionName}-${timestamp}.json`);
        this.functionsFilePath = path.join(tmpDir, `duckdb-functions-${safeConnectionName}-${timestamp}.json`);

        // Immediately fetch schema and functions from R session
        await this.refreshSchema();
        await this.refreshFunctions();
    }

    /**
     * Query schema from active R DuckDB connection and write to file
     */
    async refreshSchema(): Promise<void> {
        if (!this.schemaFilePath) {
            throw new Error('No schema file path set. Call connect() first.');
        }

        const targetConnection = this.connectionName;
        // Normalize file path for R (forward slashes, escape backslashes)
        const schemaFilePath = this.schemaFilePath.replace(/\\/g, '/');

        const rCode = `
tryCatch({
    # Get the specific connection object
    if (!exists("${targetConnection}", envir = .GlobalEnv)) {
        stop("Connection '${targetConnection}' not found in R session")
    }

    .dbre_tmp_conn <- get("${targetConnection}", envir = .GlobalEnv)

    if (!inherits(.dbre_tmp_conn, "duckdb_connection")) {
        stop("Object '${targetConnection}' is not a DuckDB connection")
    }

    # Get schema information
    if (!requireNamespace("DBI", quietly = TRUE)) {
        stop("DBI package not available")
    }

    tables <- DBI::dbListTables(.dbre_tmp_conn)
    result <- list()

    for (table in tables) {
        tryCatch({
            col_info <- DBI::dbGetQuery(.dbre_tmp_conn, sprintf(
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

    # Write to file (no console output in silent mode)
    schema_file_path <- "${schemaFilePath}"

    if (requireNamespace("jsonlite", quietly = TRUE)) {
        jsonlite::write_json(result, schema_file_path, auto_unbox = TRUE, pretty = TRUE)
    } else {
        json_output <- if (length(result) == 0) {
            "[]"
        } else {
            paste0("[", paste(sapply(result, function(r) {
                sprintf('{"table_name":"%s","column_name":"%s","data_type":"%s","is_nullable":"%s"}',
                    r$table_name, r$column_name, r$data_type, r$is_nullable)
            }), collapse = ","), "]")
        }
        writeLines(json_output, schema_file_path)
    }

    # Cleanup: Remove temporary connection reference
    rm(.dbre_tmp_conn)

    invisible(NULL)
}, error = function(e) {
    stop(e$message)
})
        `.trim();

        try {
            let errorOutput = '';

            await this.positronApi.runtime.executeCode(
                'r',
                rCode,
                false,
                false,
                'silent' as any,
                undefined,
                {
                    onError: (text: string) => { errorOutput += text; }
                }
            );

            if (errorOutput) {
                throw new Error(errorOutput);
            }

            // Read schema from file
            await this.readSchemaFromFile();
        } catch (error: any) {
            console.error('Failed to refresh schema:', error);
            throw new Error(`Failed to refresh schema: ${error.message}`);
        }
    }

    /**
     * Read schema from file and update schema map
     */
    private async readSchemaFromFile(): Promise<void> {
        if (!this.schemaFilePath) {
            throw new Error('No schema file path set');
        }

        try {
            const fileUri = vscode.Uri.file(this.schemaFilePath);
            const fileContent = await vscode.workspace.fs.readFile(fileUri);
            const jsonStr = new TextDecoder().decode(fileContent);
            const schemaData = JSON.parse(jsonStr);

            // Update schema map
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
        } catch (error: any) {
            console.error('Failed to read schema file:', error);
            throw new Error(`Failed to read schema file: ${error.message}`);
        }
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

    /**
     * Get current connection name
     */
    getConnectionName(): string | null {
        return this.connectionName;
    }

    /**
     * Get functions from R connection
     */
    getRFunctions(): any[] {
        return this.rFunctions;
    }

    /**
     * Refresh functions from R DuckDB connection
     */
    async refreshFunctions(): Promise<void> {
        if (!this.functionsFilePath) {
            return;
        }

        const targetConnection = this.connectionName;
        const functionsFilePath = this.functionsFilePath.replace(/\\/g, '/');

        const rCode = `
tryCatch({
    if (!exists("${targetConnection}", envir = .GlobalEnv)) {
        stop("Connection '${targetConnection}' not found in R session")
    }

    .dbre_tmp_conn <- get("${targetConnection}", envir = .GlobalEnv)

    if (!inherits(.dbre_tmp_conn, "duckdb_connection")) {
        stop("Object '${targetConnection}' is not a DuckDB connection")
    }

    # Query all functions from DuckDB
    .dbre_functions <- DBI::dbGetQuery(.dbre_tmp_conn, "SELECT * FROM duckdb_functions()")

    # Write to file
    .dbre_func_file <- "${functionsFilePath}"

    if (requireNamespace("jsonlite", quietly = TRUE)) {
        jsonlite::write_json(.dbre_functions, .dbre_func_file, auto_unbox = TRUE, pretty = FALSE)
    } else {
        # Fallback: write simplified JSON
        .dbre_json <- paste0("[", paste(apply(.dbre_functions, 1, function(row) {
            sprintf('{"function_name":"%s","function_type":"%s","description":"%s","return_type":"%s"}',
                row["function_name"], row["function_type"],
                gsub('"', '\\\\"', row["description"]), row["return_type"])
        }), collapse = ","), "]")
        writeLines(.dbre_json, .dbre_func_file)
    }

    rm(.dbre_tmp_conn, .dbre_functions, .dbre_func_file)
    if (exists(".dbre_json")) rm(.dbre_json)

    invisible(NULL)
}, error = function(e) {
    stop(e$message)
})
        `.trim();

        try {
            let errorOutput = '';

            await this.positronApi.runtime.executeCode(
                'r',
                rCode,
                false,
                false,
                'silent' as any,
                undefined,
                {
                    onError: (text: string) => { errorOutput += text; }
                }
            );

            if (errorOutput) {
                throw new Error(errorOutput);
            }

            // Read functions from file
            await this.readFunctionsFromFile();
        } catch (error: any) {
            console.error('Failed to refresh functions:', error);
            // Don't throw - functions are optional, schema is critical
        }
    }

    /**
     * Read functions from file
     */
    private async readFunctionsFromFile(): Promise<void> {
        if (!this.functionsFilePath) {
            throw new Error('No functions file path set');
        }

        try {
            const fileUri = vscode.Uri.file(this.functionsFilePath);
            const fileContent = await vscode.workspace.fs.readFile(fileUri);
            const jsonStr = new TextDecoder().decode(fileContent);
            this.rFunctions = JSON.parse(jsonStr);
        } catch (error: any) {
            console.error('Failed to read functions file:', error);
            this.rFunctions = [];
        }
    }

    dispose() {
        // Cleanup temp schema file
        if (this.schemaFilePath) {
            try {
                const fileUri = vscode.Uri.file(this.schemaFilePath);
                vscode.workspace.fs.delete(fileUri);
            } catch (error) {
                // Ignore cleanup errors
            }
            this.schemaFilePath = null;
        }

        // Cleanup temp functions file
        if (this.functionsFilePath) {
            try {
                const fileUri = vscode.Uri.file(this.functionsFilePath);
                vscode.workspace.fs.delete(fileUri);
            } catch (error) {
                // Ignore cleanup errors
            }
            this.functionsFilePath = null;
        }

        this.connectionName = null;
        this.dbPath = null;
        this.schema.clear();
        this.rFunctions = [];
    }
}
