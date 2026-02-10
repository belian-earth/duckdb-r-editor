import * as vscode from 'vscode';
import { DBI_FUNCTIONS, GLUE_FUNCTIONS, DUCKPLYR_FUNCTIONS, PARSING_LIMITS } from './types';
import { ParenMatcher } from './utils/parenMatcher';
import { GlueInterpolationHandler } from './utils/glueInterpolationHandler';
import { SQLRegionFinder } from './utils/sqlRegionFinder';

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
    private static readonly DUCKPLYR_FUNCTIONS = DUCKPLYR_FUNCTIONS;

    /**
     * Check if position is inside a SQL string
     * Uses the same logic as semantic highlighting for consistency
     */
    static isInsideSQLString(document: vscode.TextDocument, position: vscode.Position): SQLStringContext | null {
        const line = document.lineAt(position.line);
        const lineText = line.text;

        // Skip if position is inside a comment
        if (this.isInsideComment(lineText, position.character)) {
            return null;
        }

        // Use the same SQL region finder as semantic highlighting
        // This ensures we find the exact same ranges
        const allSQLRanges = SQLRegionFinder.findSQLFunctionStrings(document);

        // Find which range (if any) contains the cursor position
        for (const stringRange of allSQLRanges) {
            // Check if position is inside this range
            // Allow at start (for semantic highlighting), but not at/after end (for autocomplete)
            if (position.isAfterOrEqual(stringRange.start) && position.isBefore(stringRange.end)) {
                // Found the range! Now validate it's actually SQL (not a named argument)
                const functionContext = this.findDBIFunctionContext(document, stringRange.start);
                if (!functionContext) {
                    continue;
                }

                const isGlueString = this.isGlueFunction(functionContext);

                // Filter out named arguments
                const openQuoteChar = Math.max(0, stringRange.start.character - 1);
                const openQuotePos = new vscode.Position(stringRange.start.line, openQuoteChar);

                // Look back to check for named argument pattern (name =)
                let lookbackStart: vscode.Position;
                if (stringRange.start.character >= 50) {
                    lookbackStart = new vscode.Position(stringRange.start.line, stringRange.start.character - 50);
                } else if (stringRange.start.line > 0) {
                    const prevLine = document.lineAt(stringRange.start.line - 1);
                    const remainingLookback = 50 - stringRange.start.character;
                    lookbackStart = new vscode.Position(
                        stringRange.start.line - 1,
                        Math.max(0, prevLine.text.length - remainingLookback)
                    );
                } else {
                    lookbackStart = new vscode.Position(0, 0);
                }

                const textBeforeQuote = document.getText(new vscode.Range(lookbackStart, openQuotePos)).trim();

                // Check if this looks like a named argument
                if (textBeforeQuote.endsWith('=')) {
                    if (isGlueString) {
                        // For glue functions, reject all named arguments
                        return null;
                    } else {
                        // For DBI/duckplyr functions, only accept "statement =" or "sql ="
                        if (!/(statement|sql)\s*=$/i.test(textBeforeQuote)) {
                            return null;
                        }
                    }
                }

                const query = document.getText(stringRange);

                return {
                    query: this.cleanSQLString(query),
                    range: stringRange,
                    functionName: functionContext,
                    isMultiline: stringRange.start.line !== stringRange.end.line,
                    isGlueString: isGlueString
                };
            }
        }

        // Position is not inside any SQL string range
        return null;
    }


    /**
     * Find if the string is part of a DBI or glue function call
     * Fixed to work with Air formatter multi-line patterns
     * Now validates that the string is actually inside the function's parentheses
     */
    private static findDBIFunctionContext(document: vscode.TextDocument, position: vscode.Position): string | null {
        // Look backwards from the string position to find function call
        const currentLine = position.line;
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

        // Check for duckplyr functions
        for (const funcName of this.DUCKPLYR_FUNCTIONS) {
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
        // Use negative lookbehind to ensure function name is not part of a longer word
        // This prevents matching 'sql' in 'madeup_sql' or similar
        const pattern = new RegExp(`(?<!\\w)${escapedName}\\s*\\(`, 'g');

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
