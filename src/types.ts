/**
 * Common types and interfaces used across the extension
 */

/**
 * Column metadata
 */
export interface ColumnInfo {
    name: string;
    type: string;
    nullable: boolean;
}

/**
 * DuckDB function metadata
 */
export interface DuckDBFunction {
    function_name: string;
    function_type: string;
    description?: string;
    return_type?: string;
    parameters?: string;
    parameter_types?: string;
}

/**
 * Generic schema provider interface
 * Implemented by both DuckDBCliProvider and DuckDBConnectionManager
 */
export interface SchemaProvider {
    getTableNames(): string[];
    getColumns(tableName: string): ColumnInfo[];
    getAllColumns(): Array<{ table: string; column: ColumnInfo }>;
    isConnected(): boolean;
}

/**
 * Extended schema provider with function support
 * Only implemented by DuckDBCliProvider
 */
export interface FunctionProvider {
    getAllFunctions?(): DuckDBFunction[];
}
