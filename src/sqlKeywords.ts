import * as vscode from 'vscode';

/**
 * SQL Keywords (including DuckDB-specific commands)
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
    // DuckDB-specific commands
    'INSTALL', 'LOAD', 'ATTACH', 'DETACH', 'USE', 'PRAGMA', 'COPY', 'EXPORT',
    // DuckDB metadata commands
    'SHOW', 'TABLES', 'DESCRIBE', 'SUMMARIZE', 'EXPLAIN'
];

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
