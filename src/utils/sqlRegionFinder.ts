import * as vscode from 'vscode';
import { SQL_FUNCTION_NAMES, PARSING_LIMITS } from '../types';

/**
 * Shared utility for finding SQL string regions in R documents
 * Used by both semantic token provider and background decorator
 */
export class SQLRegionFinder {
    /**
     * Find the range of a function call (from function name to closing paren)
     */
    static findFunctionCallRange(document: vscode.TextDocument, startPos: vscode.Position): vscode.Range | null {
        const startOffset = document.offsetAt(startPos);
        const text = document.getText();

        // Find opening paren
        let i = startOffset;
        let searchCount = 0;

        while (i < text.length && text[i] !== '(' && searchCount < PARSING_LIMITS.MAX_PAREN_SEARCH_DISTANCE) {
            i++;
            searchCount++;
        }

        if (i >= text.length || searchCount >= PARSING_LIMITS.MAX_PAREN_SEARCH_DISTANCE) {
            return null;
        }

        // Find matching closing paren (handling nested parens and strings)
        let depth = 0;
        let inString = false;
        let stringChar = '';

        i++; // Move past opening paren
        const openParenOffset = i;

        while (i < text.length && (i - openParenOffset) < PARSING_LIMITS.MAX_FUNCTION_CALL_LENGTH) {
            const char = text[i];
            const prevChar = i > 0 ? text[i - 1] : '';

            // Handle string literals
            if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
            }

            // Only count parens if not in a string
            if (!inString) {
                if (char === '(') {
                    depth++;
                } else if (char === ')') {
                    if (depth === 0) {
                        // Found the matching closing paren
                        return new vscode.Range(
                            startPos,
                            document.positionAt(i + 1)
                        );
                    }
                    depth--;
                }
            }

            i++;
        }

        // No matching closing paren found within reasonable distance
        return null;
    }

    /**
     * Find all string literals within a given range
     */
    static findStringsInRange(document: vscode.TextDocument, range: vscode.Range): vscode.Range[] {
        const strings: vscode.Range[] = [];
        const text = document.getText(range);
        const startOffset = document.offsetAt(range.start);

        let i = 0;
        while (i < text.length) {
            const char = text[i];

            // Check if this is a string start
            if (char === '"' || char === "'" || char === '`') {
                const quoteChar = char;
                const stringStartOffset = startOffset + i;
                const stringStart = document.positionAt(stringStartOffset + 1); // +1 to skip opening quote

                // Find closing quote
                let j = i + 1;
                while (j < text.length) {
                    if (text[j] === quoteChar && text[j - 1] !== '\\') {
                        // Found closing quote
                        const stringEndOffset = startOffset + j;
                        const stringEnd = document.positionAt(stringEndOffset);
                        strings.push(new vscode.Range(stringStart, stringEnd));
                        i = j;
                        break;
                    }
                    j++;
                }
            }

            i++;
        }

        return strings;
    }

    /**
     * Find all SQL function calls and their string arguments in a document
     * Returns string ranges that can be validated further
     */
    static findSQLFunctionStrings(
        document: vscode.TextDocument,
        token?: vscode.CancellationToken
    ): vscode.Range[] {
        const stringRanges: vscode.Range[] = [];
        const processedRanges = new Set<string>();

        const fullText = document.getText();

        // Limit text processing for very large documents
        if (fullText.length > PARSING_LIMITS.MAX_DOCUMENT_SIZE) {
            console.warn(`Document too large (${fullText.length} chars), skipping SQL detection`);
            return stringRanges;
        }

        // Find all SQL function calls in the document
        for (const funcName of SQL_FUNCTION_NAMES) {
            if (token?.isCancellationRequested) {
                return stringRanges;
            }

            const escapedName = funcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const funcPattern = new RegExp(`\\b${escapedName}\\s*\\(`, 'g');

            let match;
            let matchCount = 0;

            while ((match = funcPattern.exec(fullText)) !== null && matchCount < PARSING_LIMITS.MAX_FUNCTION_MATCHES) {
                matchCount++;

                if (token?.isCancellationRequested) {
                    return stringRanges;
                }

                const funcStartOffset = match.index;
                const funcPosition = document.positionAt(funcStartOffset);

                // Skip if this function call is in an R comment
                const lineText = document.lineAt(funcPosition.line).text;
                const lineBeforeFunc = lineText.substring(0, funcPosition.character);
                if (lineBeforeFunc.trim().startsWith('#')) {
                    continue;
                }

                // Find the matching closing paren to get the full function call
                const callRange = this.findFunctionCallRange(document, funcPosition);
                if (!callRange) {
                    continue;
                }

                // Find all string literals within this function call
                const stringsInCall = this.findStringsInRange(document, callRange);

                for (const stringRange of stringsInCall) {
                    // Create unique key for this range
                    const rangeKey = `${stringRange.start.line}:${stringRange.start.character}-${stringRange.end.line}:${stringRange.end.character}`;

                    if (processedRanges.has(rangeKey)) {
                        continue;
                    }

                    processedRanges.add(rangeKey);
                    stringRanges.push(stringRange);
                }
            }
        }

        return stringRanges;
    }
}
