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
        this.connectionName = connectionName;
        this.dbPath = dbPath;
        console.log(`Connected to R connection '${connectionName}' (${dbPath})`);

        // Create temp file for schema
        const tmpDir = os.tmpdir();
        const timestamp = Date.now();
        this.schemaFilePath = path.join(tmpDir, `duckdb-schema-${connectionName}-${timestamp}.json`);

        // Immediately fetch schema from R session
        await this.refreshSchema();
    }

    /**
     * Query schema from active R DuckDB connection and write to file
     */
    async refreshSchema(): Promise<void> {
        if (!this.schemaFilePath) {
            throw new Error('No schema file path set. Call connect() first.');
        }

        console.log(`Querying schema from R connection '${this.connectionName}'...`);

        const targetConnection = this.connectionName;
        // Normalize file path for R (forward slashes, escape backslashes)
        const schemaFilePath = this.schemaFilePath.replace(/\\/g, '/');

        const rCode = `
tryCatch({
    # Get the specific connection object
    if (!exists("${targetConnection}", envir = .GlobalEnv)) {
        stop("Connection '${targetConnection}' not found in R session")
    }

    con <- get("${targetConnection}", envir = .GlobalEnv)

    if (!inherits(con, "duckdb_connection")) {
        stop("Object '${targetConnection}' is not a DuckDB connection")
    }

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

            console.log(`✓ Schema loaded: ${this.schema.size} tables`);
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

            console.log(`✓ Read schema from file: ${this.schema.size} tables`);
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

    dispose() {
        // Cleanup temp schema file
        if (this.schemaFilePath) {
            try {
                const fileUri = vscode.Uri.file(this.schemaFilePath);
                vscode.workspace.fs.delete(fileUri).then(
                    () => console.log(`Deleted schema file: ${this.schemaFilePath}`),
                    (error) => console.log(`Could not delete schema file: ${error}`)
                );
            } catch (error) {
                // Ignore cleanup errors
                console.log('Error cleaning up schema file:', error);
            }
            this.schemaFilePath = null;
        }

        this.connectionName = null;
        this.dbPath = null;
        this.schema.clear();
    }
}
