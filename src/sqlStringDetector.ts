import * as vscode from 'vscode';

export interface SQLStringContext {
    query: string;
    range: vscode.Range;
    functionName: string;
    isMultiline: boolean;
    isGlueString: boolean;
}

/**
 * Detects SQL strings in R code, particularly in DBI function calls
 */
export class SQLStringDetector {
    private static readonly DBI_FUNCTIONS = [
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
    ];

    private static readonly GLUE_FUNCTIONS = [
        'glue',
        'glue_sql',
        'glue_data',
        'glue_data_sql',
        'glue::glue',
        'glue::glue_sql',
        'glue::glue_data',
        'glue::glue_data_sql'
    ];

    /**
     * Check if position is inside a SQL string
     */
    static isInsideSQLString(document: vscode.TextDocument, position: vscode.Position): SQLStringContext | null {
        const line = document.lineAt(position.line);
        const lineText = line.text;

        // Check if we're inside a string
        const stringRange = this.getStringRangeAtPosition(document, position);
        if (!stringRange) {
            return null;
        }

        // Check if this string is part of a DBI function call
        const functionContext = this.findDBIFunctionContext(document, stringRange.start);
        if (!functionContext) {
            return null;
        }

        const query = document.getText(stringRange);
        const isGlueString = this.isGlueFunction(functionContext);

        return {
            query: this.cleanSQLString(query),
            range: stringRange,
            functionName: functionContext,
            isMultiline: stringRange.start.line !== stringRange.end.line,
            isGlueString: isGlueString
        };
    }

    /**
     * Get the range of the string at the given position
     */
    private static getStringRangeAtPosition(document: vscode.TextDocument, position: vscode.Position): vscode.Range | null {
        const line = document.lineAt(position.line);
        const lineText = line.text;
        const charPos = position.character;

        // Find opening quote
        let openQuote = -1;
        let quoteChar = '';

        for (let i = charPos; i >= 0; i--) {
            const char = lineText[i];
            if (char === '"' || char === "'" || char === '`') {
                // Check if it's escaped
                if (i > 0 && lineText[i - 1] === '\\') {
                    continue;
                }
                openQuote = i;
                quoteChar = char;
                break;
            }
        }

        if (openQuote === -1) {
            return null;
        }

        // Find closing quote (could be on another line)
        let closeQuote = -1;
        let currentLine = position.line;
        let searchText = lineText.substring(openQuote + 1);

        while (currentLine < document.lineCount) {
            const searchLineText = currentLine === position.line ? searchText : document.lineAt(currentLine).text;

            for (let i = 0; i < searchLineText.length; i++) {
                const char = searchLineText[i];
                if (char === quoteChar) {
                    // Check if it's escaped
                    if (i > 0 && searchLineText[i - 1] === '\\') {
                        continue;
                    }
                    closeQuote = i;
                    break;
                }
            }

            if (closeQuote !== -1) {
                const startPos = new vscode.Position(position.line, openQuote + 1);
                const endPos = currentLine === position.line
                    ? new vscode.Position(currentLine, openQuote + 1 + closeQuote)
                    : new vscode.Position(currentLine, closeQuote);

                return new vscode.Range(startPos, endPos);
            }

            currentLine++;
        }

        return null;
    }

    /**
     * Find if the string is part of a DBI or glue function call
     * Fixed to work with Air formatter multi-line patterns
     */
    private static findDBIFunctionContext(document: vscode.TextDocument, position: vscode.Position): string | null {
        // Look backwards from the string position to find function call
        let currentLine = position.line;
        let searchText = '';

        // Gather context (up to 10 lines back for Air formatter)
        for (let i = Math.max(0, currentLine - 10); i <= currentLine; i++) {
            searchText += document.lineAt(i).text + '\n';
        }

        // Check for DBI functions
        // Use [\s\S]*? to match ANY characters including newlines between function name and (
        for (const funcName of this.DBI_FUNCTIONS) {
            const escapedName = funcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(`${escapedName}[\\s\\S]*?\\(`, 'i');
            if (pattern.test(searchText)) {
                return funcName;
            }
        }

        // Check for glue functions
        for (const funcName of this.GLUE_FUNCTIONS) {
            const escapedName = funcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(`${escapedName}[\\s\\S]*?\\(`, 'i');
            if (pattern.test(searchText)) {
                return funcName;
            }
        }

        return null;
    }

    /**
     * Check if function is a glue function
     */
    private static isGlueFunction(functionName: string): boolean {
        return this.GLUE_FUNCTIONS.some(f => f.toLowerCase() === functionName.toLowerCase());
    }

    /**
     * Clean SQL string (remove R string escapes, etc.)
     */
    private static cleanSQLString(sql: string): string {
        return sql
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .trim();
    }

    /**
     * Get the cursor position relative to the SQL string
     */
    static getSQLCursorPosition(document: vscode.TextDocument, position: vscode.Position, context: SQLStringContext): number {
        const stringStart = context.range.start;

        if (position.line === stringStart.line) {
            return position.character - stringStart.character;
        }

        // Multi-line calculation
        let offset = 0;
        for (let line = stringStart.line; line < position.line; line++) {
            offset += document.lineAt(line).text.length - (line === stringStart.line ? stringStart.character : 0) + 1; // +1 for newline
        }
        offset += position.character;

        return offset;
    }

    /**
     * Check if cursor is inside a glue interpolation block {}
     */
    static isInsideGlueInterpolation(sqlString: string, cursorOffset: number): boolean {
        let depth = 0;
        let inString = false;
        let stringChar = '';

        for (let i = 0; i < cursorOffset; i++) {
            const char = sqlString[i];
            const prevChar = i > 0 ? sqlString[i - 1] : '';

            // Track if we're inside a quoted string within the interpolation
            if ((char === '"' || char === "'") && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
            }

            // Only count braces if we're not inside a string
            if (!inString) {
                if (char === '{') {
                    depth++;
                } else if (char === '}') {
                    depth--;
                }
            }
        }

        return depth > 0;
    }

    /**
     * Strip glue interpolations from SQL string for validation
     * Replaces {expr} with placeholder values
     */
    static stripGlueInterpolations(sqlString: string): string {
        let result = '';
        let depth = 0;
        let inString = false;
        let stringChar = '';
        let interpolationStart = -1;

        for (let i = 0; i < sqlString.length; i++) {
            const char = sqlString[i];
            const prevChar = i > 0 ? sqlString[i - 1] : '';

            // Track if we're inside a quoted string
            if ((char === '"' || char === "'") && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
            }

            if (!inString) {
                if (char === '{') {
                    if (depth === 0) {
                        interpolationStart = i;
                    }
                    depth++;
                } else if (char === '}') {
                    depth--;
                    if (depth === 0 && interpolationStart !== -1) {
                        // Replace the interpolation with a placeholder
                        result += 'PLACEHOLDER_VALUE';
                        interpolationStart = -1;
                        continue;
                    }
                }
            }

            // Only add character if we're not inside an interpolation
            if (depth === 0) {
                result += char;
            }
        }

        return result;
    }
}
