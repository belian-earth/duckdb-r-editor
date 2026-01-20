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
