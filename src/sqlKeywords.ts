import * as vscode from 'vscode';

/**
 * SQL Keywords for autocomplete (phrases like 'LEFT JOIN', 'GROUP BY')
 */
export const SQL_KEYWORDS = [
    'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'OUTER JOIN',
    'ON', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'OFFSET',
    'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
    'CREATE', 'TABLE', 'VIEW', 'INDEX', 'DROP', 'ALTER',
    'AS', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS NULL', 'IS NOT NULL',
    'DISTINCT', 'ALL', 'ASC', 'DESC', 'UNION', 'INTERSECT', 'EXCEPT',
    'WITH', 'RECURSIVE', 'CTE', 'WINDOW', 'PARTITION BY', 'OVER',
    'NULLS FIRST', 'NULLS LAST',
    // DuckDB-specific SELECT modifiers
    'EXCLUDE', 'REPLACE', 'COLUMNS',
    // DuckDB-specific commands
    'INSTALL', 'LOAD', 'ATTACH', 'DETACH', 'USE', 'PRAGMA', 'COPY', 'EXPORT',
    // DuckDB metadata commands
    'SHOW', 'TABLES', 'DESCRIBE', 'SUMMARIZE', 'EXPLAIN',
    // Additional common keywords
    'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'CAST', 'USING', 'RETURNING',
    'CROSS JOIN', 'FULL OUTER JOIN', 'NATURAL JOIN', 'SEMI JOIN', 'ANTI JOIN',
    'QUALIFY', 'ASOF JOIN', 'POSITIONAL JOIN'
] as const;

/**
 * SQL Keywords for semantic highlighting (individual words, not phrases)
 * Comprehensive list including DuckDB-specific commands
 */
export const SQL_KEYWORD_TOKENS = new Set([
    // Standard SQL keywords
    'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET',
    'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE',
    'DROP', 'ALTER', 'INDEX', 'VIEW', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL',
    'OUTER', 'CROSS', 'ON', 'USING', 'AS', 'AND', 'OR', 'NOT', 'IN', 'EXISTS',
    'BETWEEN', 'LIKE', 'IS', 'NULL', 'TRUE', 'FALSE', 'CASE', 'WHEN', 'THEN',
    'ELSE', 'END', 'DISTINCT', 'ALL', 'UNION', 'INTERSECT', 'EXCEPT', 'WITH',
    'RECURSIVE', 'CAST', 'INTERVAL', 'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST',
    // DuckDB-specific commands
    'INSTALL', 'LOAD', 'ATTACH', 'DETACH', 'COPY', 'EXPORT', 'IMPORT',
    'PRAGMA', 'DESCRIBE', 'SHOW', 'SUMMARIZE', 'PIVOT', 'UNPIVOT',
    'EXPLAIN', 'ANALYZE', 'VACUUM', 'CHECKPOINT', 'FORCE',
    // Additional SQL keywords
    'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'UNIQUE',
    'CHECK', 'DEFAULT', 'AUTO_INCREMENT', 'SEQUENCE', 'GENERATED',
    'TEMPORARY', 'TEMP', 'IF', 'NOT', 'EXISTS', 'REPLACE',
    'RETURNING', 'CONFLICT', 'DO', 'NOTHING', 'UPSERT',
    'WINDOW', 'OVER', 'PARTITION', 'RANGE', 'ROWS', 'PRECEDING', 'FOLLOWING',
    'UNBOUNDED', 'CURRENT', 'ROW', 'FILTER', 'EXCLUDE', 'COLUMNS', 'QUALIFY',
    // Data types
    'INTEGER', 'INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'HUGEINT',
    'DOUBLE', 'REAL', 'FLOAT', 'DECIMAL', 'NUMERIC',
    'VARCHAR', 'CHAR', 'TEXT', 'STRING',
    'DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMPTZ', 'INTERVAL',
    'BOOLEAN', 'BOOL', 'BLOB', 'BYTEA',
    'JSON', 'ARRAY', 'LIST', 'STRUCT', 'MAP', 'UNION',
    'UUID', 'ENUM'
]);

/**
 * SQL Functions for semantic highlighting
 * Common DuckDB functions
 */
export const SQL_FUNCTION_TOKENS = new Set([
    'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'STRING_AGG', 'ARRAY_AGG',
    'CONCAT', 'UPPER', 'LOWER', 'SUBSTRING', 'TRIM', 'LENGTH',
    'DATE_TRUNC', 'EXTRACT', 'NOW', 'CURRENT_DATE', 'CURRENT_TIMESTAMP',
    'STRFTIME', 'MAKE_DATE', 'MAKE_TIMESTAMP',
    'COALESCE', 'NULLIF', 'GREATEST', 'LEAST',
    'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LAG', 'LEAD',
    'FIRST_VALUE', 'LAST_VALUE', 'NTH_VALUE',
    'UNNEST', 'LIST_VALUE', 'STRUCT_PACK', 'REGEXP_MATCHES'
]);

/**
 * Get completion items for SQL keywords
 */
export function getKeywordCompletions(sortPrefix: string = '2'): vscode.CompletionItem[] {
    return SQL_KEYWORDS.map(keyword => {
        const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
        item.insertText = keyword;
        item.sortText = `${sortPrefix}_${keyword}`;
        return item;
    });
}
