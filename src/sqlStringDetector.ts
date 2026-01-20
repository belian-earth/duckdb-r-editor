import * as vscode from 'vscode';
import { DBI_FUNCTIONS, GLUE_FUNCTIONS, PARSING_LIMITS } from './types';
import { ParenMatcher } from './utils/parenMatcher';
import { GlueInterpolationHandler } from './utils/glueInterpolationHandler';

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
    private static readonly DBI_FUNCTIONS = DBI_FUNCTIONS;
    private static readonly GLUE_FUNCTIONS = GLUE_FUNCTIONS;

    /**
     * Check if position is inside a SQL string
     */
    static isInsideSQLString(document: vscode.TextDocument, position: vscode.Position): SQLStringContext | null {
        const line = document.lineAt(position.line);
        const lineText = line.text;

        // Skip if position is inside a comment
        if (this.isInsideComment(lineText, position.character)) {
            return null;
        }

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
        // Find opening quote - search backwards across multiple lines
        let openQuoteLine = -1;
        let openQuoteChar = -1;
        let quoteChar = '';

        // Start from current position and search backwards
        for (let lineNum = position.line; lineNum >= Math.max(0, position.line - PARSING_LIMITS.CONTEXT_LINE_LOOKBACK); lineNum--) {
            const lineText = document.lineAt(lineNum).text;
            const startChar = lineNum === position.line ? position.character : lineText.length - 1;

            for (let i = startChar; i >= 0; i--) {
                const char = lineText[i];
                if (char === '"' || char === "'" || char === '`') {
                    // Check if it's escaped
                    if (i > 0 && lineText[i - 1] === '\\') {
                        continue;
                    }
                    // Check if this quote is inside a comment
                    if (this.isInsideComment(lineText, i)) {
                        continue;
                    }
                    openQuoteLine = lineNum;
                    openQuoteChar = i;
                    quoteChar = char;
                    break;
                }
            }

            if (openQuoteLine !== -1) {
                break;
            }
        }

        if (openQuoteLine === -1) {
            return null;
        }

        // Find closing quote (could be on another line) - search forward from opening quote
        let closeQuoteLine = -1;
        let closeQuoteChar = -1;

        for (let lineNum = openQuoteLine; lineNum < document.lineCount; lineNum++) {
            const lineText = document.lineAt(lineNum).text;
            const startChar = lineNum === openQuoteLine ? openQuoteChar + 1 : 0;

            for (let i = startChar; i < lineText.length; i++) {
                const char = lineText[i];
                if (char === quoteChar) {
                    // Check if it's escaped
                    if (i > 0 && lineText[i - 1] === '\\') {
                        continue;
                    }
                    // Check if this quote is inside a comment
                    if (this.isInsideComment(lineText, i)) {
                        continue;
                    }
                    closeQuoteLine = lineNum;
                    closeQuoteChar = i;
                    break;
                }
            }

            if (closeQuoteLine !== -1) {
                break;
            }
        }

        // If no closing quote found, return null
        if (closeQuoteLine === -1) {
            return null;
        }

        // Create range from opening to closing quote (excluding the quotes themselves)
        const startPos = new vscode.Position(openQuoteLine, openQuoteChar + 1);
        const endPos = new vscode.Position(closeQuoteLine, closeQuoteChar);

        return new vscode.Range(startPos, endPos);
    }

    /**
     * Find if the string is part of a DBI or glue function call
     * Fixed to work with Air formatter multi-line patterns
     * Now validates that the string is actually inside the function's parentheses
     */
    private static findDBIFunctionContext(document: vscode.TextDocument, position: vscode.Position): string | null {
        // Look backwards from the string position to find function call
        let currentLine = position.line;
        let searchText = '';
        const startLine = Math.max(0, currentLine - PARSING_LIMITS.CONTEXT_LINE_LOOKBACK);

        // Gather context (Air formatter may have function name several lines above)
        for (let i = startLine; i <= currentLine; i++) {
            searchText += document.lineAt(i).text + '\n';
        }

        // Calculate the string position within searchText
        let stringPosInSearch = 0;
        for (let i = startLine; i < position.line; i++) {
            stringPosInSearch += document.lineAt(i).text.length + 1; // +1 for newline
        }
        stringPosInSearch += position.character;

        // Check for DBI functions
        for (const funcName of this.DBI_FUNCTIONS) {
            const match = this.findFunctionAndValidatePosition(searchText, funcName, stringPosInSearch);
            if (match) {
                return funcName;
            }
        }

        // Check for glue functions
        for (const funcName of this.GLUE_FUNCTIONS) {
            const match = this.findFunctionAndValidatePosition(searchText, funcName, stringPosInSearch);
            if (match) {
                return funcName;
            }
        }

        return null;
    }

    /**
     * Find function and validate that position is inside its parentheses
     */
    private static findFunctionAndValidatePosition(text: string, funcName: string, position: number): boolean {
        const escapedName = funcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`${escapedName}[\\s\\S]*?\\(`, 'gi');

        let match;
        while ((match = pattern.exec(text)) !== null) {
            const openParenPos = match.index + match[0].length - 1;

            // If the position is before this function, skip
            if (position < openParenPos) {
                continue;
            }

            // Find the matching closing parenthesis
            const closeParenPos = ParenMatcher.findMatchingCloseParen(text, openParenPos);

            if (closeParenPos === -1) {
                // No matching close paren found, assume it's at end of text (incomplete code)
                if (position >= openParenPos) {
                    return true;
                }
            } else if (position >= openParenPos && position <= closeParenPos) {
                // Position is inside this function call
                return true;
            }
        }

        return false;
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
        return GlueInterpolationHandler.isInsideInterpolation(sqlString, cursorOffset);
    }

    /**
     * Strip glue interpolations from SQL string for validation
     * Replaces {expr} with placeholder values
     */
    static stripGlueInterpolations(sqlString: string): string {
        return GlueInterpolationHandler.stripInterpolations(sqlString);
    }

    /**
     * Check if a character position is inside an R comment
     * In R, comments start with # and go to end of line
     * Need to make sure the # isn't inside a string
     */
    private static isInsideComment(lineText: string, charPosition: number): boolean {
        let inString = false;
        let stringChar = '';

        for (let i = 0; i < lineText.length; i++) {
            const char = lineText[i];
            const prevChar = i > 0 ? lineText[i - 1] : '';

            // Track string boundaries (ignore escaped quotes)
            if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
            }

            // If we find # outside a string, everything after is a comment
            if (!inString && char === '#') {
                // Check if charPosition is after this #
                return charPosition >= i;
            }
        }

        return false;
    }
}
