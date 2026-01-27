import * as vscode from 'vscode';
import { DocumentCache, CachedSQLRegion } from './documentCache';
import { SQL_FUNCTION_NAMES, PARSING_LIMITS } from './types';
import { SQL_KEYWORD_TOKENS, SQL_FUNCTION_TOKENS } from './sqlKeywords';
import { SQLStringDetector } from './sqlStringDetector';

/**
 * Semantic token provider for SQL syntax highlighting in R strings
 * This approach is more robust than TextMate grammar for multi-line strings
 */
export class SQLSemanticTokenProvider implements vscode.DocumentSemanticTokensProvider {
    private documentCache: DocumentCache;

    constructor(documentCache: DocumentCache) {
        this.documentCache = documentCache;
    }

    /**
     * Define token types and modifiers
     */
    public static getLegend(): vscode.SemanticTokensLegend {
        const tokenTypes = [
            'keyword',      // SQL keywords: SELECT, FROM, WHERE, etc.
            'function',     // SQL functions: COUNT, SUM, DATE_TRUNC, etc.
            'string',       // String literals within SQL
            'number',       // Numeric literals
            'operator',     // Operators: =, >, <, AND, OR, etc.
            'comment',      // SQL comments
            'variable',     // Column names, aliases
            'class',        // Table names (appears after FROM, JOIN)
            'parameter'     // Function parameters
        ];

        const tokenModifiers: string[] = [];

        return new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);
    }

    /**
     * Provide semantic tokens ONLY for SQL strings (not entire document)
     * This ensures we don't interfere with R's native syntax highlighting
     */
    public provideDocumentSemanticTokens(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.SemanticTokens> {
        try {
            // Check if R file
            if (document.languageId !== 'r') {
                return null;
            }

            // Early cancellation check
            if (token.isCancellationRequested) {
                return null;
            }

            const tokensBuilder = new vscode.SemanticTokensBuilder(SQLSemanticTokenProvider.getLegend());

            // Parse document for SQL regions (with cancellation support)
            const sqlRegions = this.parseSQLRegions(document, token);

            // Check cancellation after parsing
            if (token.isCancellationRequested) {
                return null;
            }

            // Cache the parsed regions
            this.documentCache.updateCache(document, sqlRegions);

            // If no SQL regions or all are empty/trivial, return undefined to let R's default highlighting work
            // This prevents interfering with R's native semantic tokens when there's no SQL to highlight
            const hasSubstantialSQL = sqlRegions.some(region => {
                const sqlText = region.sqlText.trim();
                // Only provide tokens if there's meaningful SQL content (more than just whitespace)
                return sqlText.length > 0;
            });

            if (!hasSubstantialSQL) {
                return undefined;
            }

            // CRITICAL: Only generate tokens for SQL content, nothing else
            // This preserves R syntax highlighting for everything outside SQL strings
            for (const region of sqlRegions) {
                if (token.isCancellationRequested) {
                    return null;
                }

                // Skip empty SQL strings
                if (region.sqlText.trim().length === 0) {
                    continue;
                }

                // Only add tokens within the SQL string bounds
                this.addTokensForSQLRegion(tokensBuilder, region, document);
            }

            return tokensBuilder.build();
        } catch (error) {
            return null;
        }
    }

    /**
     * Parse document to find all SQL string regions
     * Efficient approach: First find SQL functions, then find strings within them
     */
    private parseSQLRegions(document: vscode.TextDocument, token?: vscode.CancellationToken): CachedSQLRegion[] {
        const regions: CachedSQLRegion[] = [];
        const processedRanges = new Set<string>();

        const fullText = document.getText();

        // Limit text processing for very large documents
        if (fullText.length > PARSING_LIMITS.MAX_DOCUMENT_SIZE) {
            console.warn(`Document too large (${fullText.length} chars), skipping SQL highlighting`);
            return regions;
        }

        // Find all SQL function calls in the document
        for (const funcName of SQL_FUNCTION_NAMES) {
            if (token?.isCancellationRequested) {
                return regions;
            }

            const escapedName = funcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Match function name followed by optional whitespace and opening paren
            const funcPattern = new RegExp(`\\b${escapedName}\\s*\\(`, 'g');

            let match;
            let matchCount = 0;

            while ((match = funcPattern.exec(fullText)) !== null && matchCount < PARSING_LIMITS.MAX_FUNCTION_MATCHES) {
                matchCount++;

                if (token?.isCancellationRequested) {
                    return regions;
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

                // Now find all string literals within this function call
                const stringsInCall = this.findStringsInRange(document, callRange);

                for (const stringRange of stringsInCall) {
                    // Create unique key for this range
                    const rangeKey = `${stringRange.start.line}:${stringRange.start.character}-${stringRange.end.line}:${stringRange.end.character}`;

                    if (processedRanges.has(rangeKey)) {
                        continue;
                    }

                    // IMPORTANT: Use SQLStringDetector to verify this is actually a SQL string
                    // This filters out named arguments like col_name = "value" in glue_sql
                    const sqlContext = SQLStringDetector.isInsideSQLString(document, stringRange.start);
                    if (!sqlContext) {
                        continue; // Not a SQL string (it's a named argument), skip it
                    }

                    processedRanges.add(rangeKey);
                    const sqlText = document.getText(stringRange);
                    const isGlue = funcName.toLowerCase().includes('glue');

                    regions.push({
                        range: stringRange,
                        functionName: funcName,
                        isMultiline: stringRange.start.line !== stringRange.end.line,
                        isGlueString: isGlue,
                        // Use original text for tokenization to preserve positions
                        sqlText: sqlText
                    });
                }
            }
        }

        return regions;
    }

    /**
     * Find the range of a function call (from function name to closing paren)
     */
    private findFunctionCallRange(document: vscode.TextDocument, startPos: vscode.Position): vscode.Range | null {
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
    private findStringsInRange(document: vscode.TextDocument, range: vscode.Range): vscode.Range[] {
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
     * Add semantic tokens for a single SQL region
     */
    private addTokensForSQLRegion(
        builder: vscode.SemanticTokensBuilder,
        region: CachedSQLRegion,
        document: vscode.TextDocument
    ): void {
        const sqlText = region.sqlText;

        // Use shared keyword and function definitions from sqlKeywords.ts
        const keywords = SQL_KEYWORD_TOKENS;
        const functions = SQL_FUNCTION_TOKENS;

        // Operators
        const operators = new Set(['=', '!=', '<>', '<', '>', '<=', '>=', '+', '-', '*', '/', '%', '||']);

        // Tokenize the SQL string
        const tokens = this.tokenizeSQL(sqlText);

        // Track context for smarter token classification
        let previousKeyword = '';

        for (let i = 0; i < tokens.length; i++) {
            const tok = tokens[i];
            const tokenType = tok.type;
            const tokenText = tok.text;
            const tokenOffset = tok.offset;

            // Calculate line and character position for this token
            const { line, char } = this.offsetToPosition(
                tokenOffset,
                region.range.start,
                document
            );

            // Determine semantic token type
            let semanticType = -1;
            const legend = SQLSemanticTokenProvider.getLegend();
            const upperText = tokenText.toUpperCase();

            if (tokenType === 'keyword' || keywords.has(upperText)) {
                semanticType = legend.tokenTypes.indexOf('keyword');
                previousKeyword = upperText;
            } else if (tokenType === 'function' || functions.has(upperText)) {
                semanticType = legend.tokenTypes.indexOf('function');
            } else if (tokenType === 'string') {
                semanticType = legend.tokenTypes.indexOf('string');
            } else if (tokenType === 'number') {
                semanticType = legend.tokenTypes.indexOf('number');
            } else if (tokenType === 'operator' || operators.has(tokenText)) {
                semanticType = legend.tokenTypes.indexOf('operator');
            } else if (tokenType === 'comment') {
                semanticType = legend.tokenTypes.indexOf('comment');
            } else if (tokenType === 'identifier') {
                // Context-aware identifier classification
                if (previousKeyword === 'FROM' || previousKeyword === 'JOIN' ||
                    previousKeyword === 'INNER' || previousKeyword === 'LEFT' ||
                    previousKeyword === 'RIGHT' || previousKeyword === 'OUTER' ||
                    previousKeyword === 'CROSS' || previousKeyword === 'INTO' ||
                    previousKeyword === 'TABLE' || previousKeyword === 'VIEW') {
                    // This is likely a table name
                    semanticType = legend.tokenTypes.indexOf('class');
                } else {
                    // This is likely a column name or variable
                    semanticType = legend.tokenTypes.indexOf('variable');
                }
            }

            // Add token if valid type
            if (semanticType >= 0) {
                builder.push(line, char, tokenText.length, semanticType, 0);
            }
        }
    }

    /**
     * Convert offset in SQL string to line/character position in document
     */
    private offsetToPosition(
        offset: number,
        startPos: vscode.Position,
        document: vscode.TextDocument
    ): { line: number; char: number } {
        let currentLine = startPos.line;
        let currentChar = startPos.character;
        let remaining = offset;

        while (remaining > 0 && currentLine < document.lineCount) {
            const lineText = document.lineAt(currentLine).text;
            const availableChars = currentLine === startPos.line
                ? lineText.length - startPos.character
                : lineText.length;

            if (remaining <= availableChars) {
                currentChar += remaining;
                break;
            }

            remaining -= availableChars + 1; // +1 for newline
            currentLine++;
            currentChar = 0;
        }

        return { line: currentLine, char: currentChar };
    }

    /**
     * Simple SQL tokenizer
     */
    private tokenizeSQL(sql: string): Array<{ type: string; text: string; offset: number }> {
        const tokens: Array<{ type: string; text: string; offset: number }> = [];
        let i = 0;

        while (i < sql.length) {
            const char = sql[i];

            // Skip whitespace
            if (/\s/.test(char)) {
                i++;
                continue;
            }

            // Comments (-- style)
            if (char === '-' && sql[i + 1] === '-') {
                let commentEnd = sql.indexOf('\n', i);
                if (commentEnd === -1) {
                    commentEnd = sql.length;
                }
                tokens.push({ type: 'comment', text: sql.substring(i, commentEnd), offset: i });
                i = commentEnd;
                continue;
            }

            // String literals
            if (char === "'" || char === '"') {
                const quote = char;
                let j = i + 1;
                while (j < sql.length && (sql[j] !== quote || sql[j - 1] === '\\')) {
                    j++;
                }
                tokens.push({ type: 'string', text: sql.substring(i, j + 1), offset: i });
                i = j + 1;
                continue;
            }

            // Numbers
            if (/\d/.test(char)) {
                let j = i;
                while (j < sql.length && /[\d.]/.test(sql[j])) {
                    j++;
                }
                tokens.push({ type: 'number', text: sql.substring(i, j), offset: i });
                i = j;
                continue;
            }

            // Identifiers and keywords
            if (/[a-zA-Z_]/.test(char)) {
                let j = i;
                while (j < sql.length && /[a-zA-Z0-9_]/.test(sql[j])) {
                    j++;
                }
                const text = sql.substring(i, j);

                // Check if followed by '(' for function detection
                let k = j;
                while (k < sql.length && /\s/.test(sql[k])) {
                    k++;
                }
                const isFunction = k < sql.length && sql[k] === '(';

                tokens.push({
                    type: isFunction ? 'function' : 'identifier',
                    text: text,
                    offset: i
                });
                i = j;
                continue;
            }

            // Operators
            if (/[=<>!+\-*/%|]/.test(char)) {
                let j = i + 1;
                while (j < sql.length && /[=<>!|]/.test(sql[j])) {
                    j++;
                }
                tokens.push({ type: 'operator', text: sql.substring(i, j), offset: i });
                i = j;
                continue;
            }

            // Skip other characters
            i++;
        }

        return tokens;
    }
}
