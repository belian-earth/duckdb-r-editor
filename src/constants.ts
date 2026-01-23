/**
 * Constants used throughout the extension
 */

/**
 * Extension configuration namespace
 */
export const EXTENSION_ID = 'duckdb-r-editor';

/**
 * Configuration keys for the extension
 */
export const CONFIG_KEYS = {
    /** Enable SQL syntax highlighting */
    SQL_HIGHLIGHTING: 'enableSQLHighlighting',
    /** Enable/disable background color for SQL strings (boolean toggle) */
    ENABLE_BACKGROUND_COLOR: 'enableSQLBackgroundColor',
    /** Custom background color value for SQL strings (color string) */
    CUSTOM_BG_COLOR: 'sqlBackgroundColor',
    /** Auto-refresh schema after modifications */
    AUTO_REFRESH: 'autoRefreshSchema',
    /** Default DuckDB extensions to load */
    DEFAULT_EXTENSIONS: 'defaultExtensions'
} as const;

/**
 * Prefix for temporary R variables to avoid namespace conflicts
 * Used when executing R code to avoid polluting user's global environment
 */
export const R_TEMP_VAR_PREFIX = '.dbre_';

/**
 * Timing constants
 */
export const TIMING = {
    /** Debounce delay for schema refresh after document changes (ms) */
    DEBOUNCE_DELAY_MS: 1500,
    /** Small delay to ensure file is written after R execution (ms) */
    FILE_WRITE_DELAY_MS: 100
} as const;

/**
 * Output channel name for extension logging
 */
export const OUTPUT_CHANNEL_NAME = 'DuckDB R Editor';

