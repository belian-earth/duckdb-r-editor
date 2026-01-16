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

/**
 * R DBI package functions that contain SQL strings
 */
export const DBI_FUNCTIONS = [
    'dbExecute',
    'dbGetQuery',
    'dbSendQuery',
    'dbSendStatement',
    'DBI::dbExecute',
    'DBI::dbGetQuery',
    'DBI::dbSendQuery',
    'DBI::dbSendStatement',
    'dbplyr::sql',
    'sql'
] as const;

/**
 * Glue package functions that contain SQL strings
 */
export const GLUE_FUNCTIONS = [
    'glue',
    'glue_sql',
    'glue_data',
    'glue_data_sql',
    'glue::glue',
    'glue::glue_sql',
    'glue::glue_data',
    'glue::glue_data_sql'
] as const;

/**
 * All R functions that may contain SQL strings
 */
export const SQL_FUNCTION_NAMES = [...DBI_FUNCTIONS, ...GLUE_FUNCTIONS] as const;

/**
 * Performance and safety limits for SQL parsing
 */
export const PARSING_LIMITS = {
    /** Maximum document size to process (1MB) */
    MAX_DOCUMENT_SIZE: 1_000_000,
    /** Maximum number of function matches per document */
    MAX_FUNCTION_MATCHES: 100,
    /** Maximum characters to search for opening parenthesis */
    MAX_PAREN_SEARCH_DISTANCE: 1000,
    /** Maximum function call length in characters (50KB) */
    MAX_FUNCTION_CALL_LENGTH: 50_000,
    /** Number of lines to look back for function context */
    CONTEXT_LINE_LOOKBACK: 10,
    /** Cache expiry time in milliseconds */
    CACHE_EXPIRY_MS: 5_000,
    /** Maximum buffer size for CLI execution (10MB) */
    MAX_CLI_BUFFER_SIZE: 10 * 1024 * 1024
} as const;
