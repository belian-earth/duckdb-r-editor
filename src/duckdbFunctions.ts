import * as vscode from 'vscode';

export interface FunctionSignature {
    name: string;
    description: string;
    signature: string;
    returnType: string;
    category: string;
    examples?: string[];
}

/**
 * Comprehensive list of DuckDB functions with signatures
 */
export const DUCKDB_FUNCTIONS: FunctionSignature[] = [
    // Aggregate Functions
    {
        name: 'COUNT',
        signature: 'COUNT(*) / COUNT(column)',
        description: 'Returns the number of rows or non-NULL values',
        returnType: 'BIGINT',
        category: 'Aggregate',
        examples: ['COUNT(*)', 'COUNT(DISTINCT user_id)']
    },
    {
        name: 'SUM',
        signature: 'SUM(column)',
        description: 'Returns the sum of all values',
        returnType: 'NUMERIC',
        category: 'Aggregate',
        examples: ['SUM(sales)', 'SUM(DISTINCT amount)']
    },
    {
        name: 'AVG',
        signature: 'AVG(column)',
        description: 'Returns the average of all values',
        returnType: 'DOUBLE',
        category: 'Aggregate',
        examples: ['AVG(price)', 'AVG(DISTINCT score)']
    },
    {
        name: 'MIN',
        signature: 'MIN(column)',
        description: 'Returns the minimum value',
        returnType: 'Same as input',
        category: 'Aggregate',
        examples: ['MIN(date)', 'MIN(price)']
    },
    {
        name: 'MAX',
        signature: 'MAX(column)',
        description: 'Returns the maximum value',
        returnType: 'Same as input',
        category: 'Aggregate',
        examples: ['MAX(date)', 'MAX(revenue)']
    },
    {
        name: 'STRING_AGG',
        signature: 'STRING_AGG(column, separator)',
        description: 'Concatenates strings with a separator',
        returnType: 'VARCHAR',
        category: 'Aggregate',
        examples: ['STRING_AGG(name, \', \')', 'STRING_AGG(tag, \';\')']
    },
    {
        name: 'ARRAY_AGG',
        signature: 'ARRAY_AGG(column)',
        description: 'Collects all values into an array',
        returnType: 'ARRAY',
        category: 'Aggregate',
        examples: ['ARRAY_AGG(product_id)', 'ARRAY_AGG(DISTINCT category)']
    },

    // String Functions
    {
        name: 'CONCAT',
        signature: 'CONCAT(string1, string2, ...)',
        description: 'Concatenates strings together',
        returnType: 'VARCHAR',
        category: 'String',
        examples: ['CONCAT(first_name, \' \', last_name)', 'CONCAT(\'ID:\', id)']
    },
    {
        name: 'UPPER',
        signature: 'UPPER(string)',
        description: 'Converts string to uppercase',
        returnType: 'VARCHAR',
        category: 'String',
        examples: ['UPPER(name)', 'UPPER(country_code)']
    },
    {
        name: 'LOWER',
        signature: 'LOWER(string)',
        description: 'Converts string to lowercase',
        returnType: 'VARCHAR',
        category: 'String',
        examples: ['LOWER(email)', 'LOWER(status)']
    },
    {
        name: 'SUBSTRING',
        signature: 'SUBSTRING(string, start, length)',
        description: 'Extracts a substring',
        returnType: 'VARCHAR',
        category: 'String',
        examples: ['SUBSTRING(text, 1, 10)', 'SUBSTRING(code, 3, 5)']
    },
    {
        name: 'LENGTH',
        signature: 'LENGTH(string)',
        description: 'Returns the length of a string',
        returnType: 'BIGINT',
        category: 'String',
        examples: ['LENGTH(description)', 'LENGTH(TRIM(name))']
    },
    {
        name: 'TRIM',
        signature: 'TRIM(string)',
        description: 'Removes leading and trailing whitespace',
        returnType: 'VARCHAR',
        category: 'String',
        examples: ['TRIM(name)', 'TRIM(BOTH \' \' FROM text)']
    },
    {
        name: 'REPLACE',
        signature: 'REPLACE(string, search, replace)',
        description: 'Replaces occurrences of a substring',
        returnType: 'VARCHAR',
        category: 'String',
        examples: ['REPLACE(text, \'old\', \'new\')', 'REPLACE(phone, \'-\', \'\')']
    },
    {
        name: 'REGEXP_MATCHES',
        signature: 'REGEXP_MATCHES(string, pattern)',
        description: 'Tests if string matches regex pattern',
        returnType: 'BOOLEAN',
        category: 'String',
        examples: ['REGEXP_MATCHES(email, \'^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$\')', 'REGEXP_MATCHES(code, \'[0-9]{3}\')']
    },
    {
        name: 'LIKE',
        signature: 'string LIKE pattern',
        description: 'Pattern matching with wildcards',
        returnType: 'BOOLEAN',
        category: 'String',
        examples: ['name LIKE \'%Smith%\'', 'email LIKE \'%@example.com\'']
    },

    // Date/Time Functions
    {
        name: 'NOW',
        signature: 'NOW()',
        description: 'Returns current timestamp',
        returnType: 'TIMESTAMP',
        category: 'DateTime',
        examples: ['NOW()', 'created_at > NOW() - INTERVAL 1 DAY']
    },
    {
        name: 'CURRENT_DATE',
        signature: 'CURRENT_DATE',
        description: 'Returns current date',
        returnType: 'DATE',
        category: 'DateTime',
        examples: ['CURRENT_DATE', 'date = CURRENT_DATE']
    },
    {
        name: 'DATE_TRUNC',
        signature: 'DATE_TRUNC(part, timestamp)',
        description: 'Truncates timestamp to specified precision',
        returnType: 'TIMESTAMP',
        category: 'DateTime',
        examples: ['DATE_TRUNC(\'day\', timestamp)', 'DATE_TRUNC(\'month\', created_at)']
    },
    {
        name: 'EXTRACT',
        signature: 'EXTRACT(part FROM timestamp)',
        description: 'Extracts part of a date/time',
        returnType: 'BIGINT',
        category: 'DateTime',
        examples: ['EXTRACT(YEAR FROM date)', 'EXTRACT(HOUR FROM timestamp)']
    },
    {
        name: 'STRFTIME',
        signature: 'STRFTIME(timestamp, format)',
        description: 'Formats timestamp as string',
        returnType: 'VARCHAR',
        category: 'DateTime',
        examples: ['STRFTIME(date, \'%Y-%m-%d\')', 'STRFTIME(timestamp, \'%H:%M:%S\')']
    },
    {
        name: 'INTERVAL',
        signature: 'INTERVAL \'value unit\'',
        description: 'Creates a time interval',
        returnType: 'INTERVAL',
        category: 'DateTime',
        examples: ['INTERVAL \'1 day\'', 'INTERVAL \'2 hours\'', 'INTERVAL \'30 minutes\'']
    },

    // Window Functions
    {
        name: 'ROW_NUMBER',
        signature: 'ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)',
        description: 'Assigns unique row numbers',
        returnType: 'BIGINT',
        category: 'Window',
        examples: ['ROW_NUMBER() OVER (ORDER BY date)', 'ROW_NUMBER() OVER (PARTITION BY category ORDER BY sales DESC)']
    },
    {
        name: 'RANK',
        signature: 'RANK() OVER (PARTITION BY ... ORDER BY ...)',
        description: 'Assigns rank with gaps for ties',
        returnType: 'BIGINT',
        category: 'Window',
        examples: ['RANK() OVER (ORDER BY score DESC)', 'RANK() OVER (PARTITION BY department ORDER BY salary DESC)']
    },
    {
        name: 'DENSE_RANK',
        signature: 'DENSE_RANK() OVER (PARTITION BY ... ORDER BY ...)',
        description: 'Assigns rank without gaps for ties',
        returnType: 'BIGINT',
        category: 'Window',
        examples: ['DENSE_RANK() OVER (ORDER BY points DESC)']
    },
    {
        name: 'LAG',
        signature: 'LAG(column, offset, default) OVER (PARTITION BY ... ORDER BY ...)',
        description: 'Accesses previous row value',
        returnType: 'Same as column',
        category: 'Window',
        examples: ['LAG(price, 1) OVER (ORDER BY date)', 'LAG(value, 1, 0) OVER (PARTITION BY product ORDER BY date)']
    },
    {
        name: 'LEAD',
        signature: 'LEAD(column, offset, default) OVER (PARTITION BY ... ORDER BY ...)',
        description: 'Accesses next row value',
        returnType: 'Same as column',
        category: 'Window',
        examples: ['LEAD(price, 1) OVER (ORDER BY date)']
    },

    // Mathematical Functions
    {
        name: 'ROUND',
        signature: 'ROUND(number, decimals)',
        description: 'Rounds number to specified decimals',
        returnType: 'NUMERIC',
        category: 'Math',
        examples: ['ROUND(price, 2)', 'ROUND(average, 0)']
    },
    {
        name: 'CEIL',
        signature: 'CEIL(number)',
        description: 'Rounds up to nearest integer',
        returnType: 'NUMERIC',
        category: 'Math',
        examples: ['CEIL(3.14)', 'CEIL(price)']
    },
    {
        name: 'FLOOR',
        signature: 'FLOOR(number)',
        description: 'Rounds down to nearest integer',
        returnType: 'NUMERIC',
        category: 'Math',
        examples: ['FLOOR(3.99)', 'FLOOR(value)']
    },
    {
        name: 'ABS',
        signature: 'ABS(number)',
        description: 'Returns absolute value',
        returnType: 'NUMERIC',
        category: 'Math',
        examples: ['ABS(-10)', 'ABS(difference)']
    },
    {
        name: 'POWER',
        signature: 'POWER(base, exponent)',
        description: 'Raises base to exponent power',
        returnType: 'DOUBLE',
        category: 'Math',
        examples: ['POWER(2, 10)', 'POWER(value, 2)']
    },

    // Conditional Functions
    {
        name: 'CASE',
        signature: 'CASE WHEN condition THEN result ... ELSE default END',
        description: 'Conditional expression',
        returnType: 'Various',
        category: 'Conditional',
        examples: ['CASE WHEN score > 90 THEN \'A\' WHEN score > 80 THEN \'B\' ELSE \'C\' END']
    },
    {
        name: 'COALESCE',
        signature: 'COALESCE(value1, value2, ...)',
        description: 'Returns first non-NULL value',
        returnType: 'Same as inputs',
        category: 'Conditional',
        examples: ['COALESCE(phone, email, \'N/A\')', 'COALESCE(discount, 0)']
    },
    {
        name: 'NULLIF',
        signature: 'NULLIF(value1, value2)',
        description: 'Returns NULL if values are equal',
        returnType: 'Same as value1',
        category: 'Conditional',
        examples: ['NULLIF(amount, 0)', 'NULLIF(status, \'unknown\')']
    },
    {
        name: 'IFNULL',
        signature: 'IFNULL(value, replacement)',
        description: 'Replaces NULL with a value',
        returnType: 'Same as inputs',
        category: 'Conditional',
        examples: ['IFNULL(name, \'Unknown\')', 'IFNULL(quantity, 0)']
    },

    // Type Conversion
    {
        name: 'CAST',
        signature: 'CAST(value AS type)',
        description: 'Converts value to specified type',
        returnType: 'Specified type',
        category: 'Conversion',
        examples: ['CAST(price AS INTEGER)', 'CAST(date AS VARCHAR)']
    },
    {
        name: 'TRY_CAST',
        signature: 'TRY_CAST(value AS type)',
        description: 'Safely converts value, returns NULL on failure',
        returnType: 'Specified type',
        category: 'Conversion',
        examples: ['TRY_CAST(text AS INTEGER)', 'TRY_CAST(value AS DATE)']
    },

    // JSON Functions
    {
        name: 'JSON_EXTRACT',
        signature: 'JSON_EXTRACT(json, path)',
        description: 'Extracts value from JSON',
        returnType: 'JSON',
        category: 'JSON',
        examples: ['JSON_EXTRACT(data, \'$.name\')', 'JSON_EXTRACT(config, \'$.settings.enabled\')']
    },
    {
        name: 'JSON_EXTRACT_STRING',
        signature: 'JSON_EXTRACT_STRING(json, path)',
        description: 'Extracts string value from JSON',
        returnType: 'VARCHAR',
        category: 'JSON',
        examples: ['JSON_EXTRACT_STRING(data, \'$.email\')']
    },

    // Array Functions
    {
        name: 'UNNEST',
        signature: 'UNNEST(array)',
        description: 'Expands array into rows',
        returnType: 'Table',
        category: 'Array',
        examples: ['UNNEST([1, 2, 3])', 'UNNEST(tags) AS tag']
    },
    {
        name: 'LIST_VALUE',
        signature: 'LIST_VALUE(value1, value2, ...)',
        description: 'Creates an array/list',
        returnType: 'ARRAY',
        category: 'Array',
        examples: ['LIST_VALUE(1, 2, 3)', 'LIST_VALUE(\'a\', \'b\', \'c\')']
    },
    {
        name: 'ARRAY_LENGTH',
        signature: 'ARRAY_LENGTH(array)',
        description: 'Returns length of array',
        returnType: 'BIGINT',
        category: 'Array',
        examples: ['ARRAY_LENGTH(tags)', 'ARRAY_LENGTH(LIST_VALUE(1, 2, 3))']
    }
];

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
 * Get completion items for DuckDB functions
 */
export function getFunctionCompletions(): vscode.CompletionItem[] {
    return DUCKDB_FUNCTIONS.map(func => {
        const item = new vscode.CompletionItem(func.name, vscode.CompletionItemKind.Function);
        item.detail = `${func.category}: ${func.returnType}`;
        item.documentation = new vscode.MarkdownString(
            `**${func.signature}**\n\n${func.description}\n\nReturns: ${func.returnType}` +
            (func.examples ? `\n\n**Examples:**\n${func.examples.map(e => `- \`${e}\``).join('\n')}` : '')
        );
        item.insertText = func.name;
        item.sortText = `1_${func.name}`;
        return item;
    });
}

/**
 * Get completion items for SQL keywords
 */
export function getKeywordCompletions(): vscode.CompletionItem[] {
    return SQL_KEYWORDS.map(keyword => {
        const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
        item.insertText = keyword;
        item.sortText = `2_${keyword}`;
        return item;
    });
}
