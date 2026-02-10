export interface InterpolationReplacement {
    placeholder: string;
    original: string;
}

/**
 * Utility for handling glue string interpolations (e.g., {variable})
 */
export class GlueInterpolationHandler {
    /**
     * Check if cursor is inside a glue interpolation block {}
     * @param sqlString The SQL string (from glue function)
     * @param cursorOffset Position in the string
     * @returns True if cursor is inside {}
     */
    static isInsideInterpolation(sqlString: string, cursorOffset: number): boolean {
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
     * @param sqlString The SQL string with glue interpolations
     * @returns SQL string with interpolations replaced
     */
    static stripInterpolations(sqlString: string): string {
        return this.extractInterpolations(sqlString).sql;
    }

    /**
     * Extract and replace glue interpolations with unique placeholders for formatting
     * @param sqlString The SQL string with glue interpolations
     * @returns Object with cleaned SQL and replacement mapping
     */
    static extractInterpolations(sqlString: string): { sql: string; replacements: InterpolationReplacement[] } {
        let result = '';
        let depth = 0;
        let inString = false;
        let stringChar = '';
        let inSQLString = false;  // Track SQL strings (at depth 0)
        let sqlStringChar = '';
        let inSQLComment = false;  // Track SQL line comments
        let interpolationStart = -1;
        let interpolationContent = '';
        const replacements: InterpolationReplacement[] = [];
        let placeholderIndex = 0;

        for (let i = 0; i < sqlString.length; i++) {
            const char = sqlString[i];
            const prevChar = i > 0 ? sqlString[i - 1] : '';
            const nextChar = i < sqlString.length - 1 ? sqlString[i + 1] : '';

            // Check if we were already inside an interpolation BEFORE processing this character
            // This excludes the opening { but includes nested braces
            const wasInsideInterpolation = depth > 0;

            // Handle newlines - reset SQL comment state
            if (char === '\n') {
                inSQLComment = false;
            }

            // Track SQL strings (at depth 0) - SQL comments don't apply inside SQL strings
            if (depth === 0 && (char === '"' || char === "'") && prevChar !== '\\') {
                if (!inSQLString) {
                    inSQLString = true;
                    sqlStringChar = char;
                } else if (char === sqlStringChar) {
                    inSQLString = false;
                }
            }

            // Track SQL comments (only when depth === 0 and not in SQL string)
            // SQL line comments start with -- and end at newline
            if (depth === 0 && !inSQLString && !inSQLComment && char === '-' && nextChar === '-') {
                inSQLComment = true;
            }

            // Track if we're inside a quoted string ONLY when inside an interpolation
            // (This prevents quotes in regular SQL from interfering with interpolation brace counting)
            // In R, quotes are escaped by doubling: "" or ''
            if (depth > 0 && (char === '"' || char === "'") && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    // Check if this is an escaped quote (doubled quote in R)
                    if (nextChar === stringChar) {
                        // This is an escaped quote (e.g., "" or ''), keep inString true
                        // Collect both quote characters as part of the interpolation content
                        if (wasInsideInterpolation) {
                            interpolationContent += char;
                            interpolationContent += nextChar;
                        }
                        if (depth === 0) {
                            result += char;
                            result += nextChar;
                        }
                        // Skip the next character since we've already processed it
                        i++;
                        continue;
                    } else {
                        // This is the closing quote
                        inString = false;
                    }
                }
            }

            // Handle braces (only count them when not inside a string literal within an interpolation)
            // AND not inside a SQL comment
            // SQL strings CAN contain interpolations (that's the whole point of glue_sql!)
            // When depth === 0, we always process braces (not inside any interpolation yet) unless in SQL comment
            if ((depth === 0 || !inString) && !inSQLComment) {
                if (char === '{') {
                    if (depth === 0) {
                        interpolationStart = i;
                        interpolationContent = '';
                        // Reset string tracking for this interpolation
                        inString = false;
                        stringChar = '';
                    }
                    depth++;
                } else if (char === '}') {
                    depth--;
                    if (depth === 0 && interpolationStart !== -1) {
                        // Create unique placeholder that's SQL-safe and unlikely to conflict
                        const placeholder = `GLUE_INTERPOLATION_${placeholderIndex}`;
                        replacements.push({
                            placeholder,
                            original: `{${interpolationContent}}`
                        });
                        result += placeholder;
                        placeholderIndex++;
                        interpolationStart = -1;
                        // Reset string tracking after interpolation ends
                        inString = false;
                        stringChar = '';
                        continue;
                    }
                }
            }

            // Collect characters that were inside interpolation BEFORE processing current char
            // This excludes opening { but includes nested braces and content
            if (wasInsideInterpolation) {
                interpolationContent += char;
            }

            // Only add character to result if we're not inside an interpolation
            if (depth === 0) {
                result += char;
            }
        }

        return { sql: result, replacements };
    }

    /**
     * Restore interpolations back into formatted SQL
     * @param formattedSQL The formatted SQL with placeholders
     * @param replacements The replacement mapping
     * @returns SQL with original {expr} interpolations restored
     */
    static restoreInterpolations(formattedSQL: string, replacements: InterpolationReplacement[]): string {
        let result = formattedSQL;

        // Replace placeholders back with original interpolations
        for (const replacement of replacements) {
            result = result.replace(replacement.placeholder, replacement.original);
        }

        return result;
    }
}
