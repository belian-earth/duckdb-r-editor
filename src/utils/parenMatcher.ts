/**
 * Utility for matching parentheses in text while accounting for strings
 */
export class ParenMatcher {
    /**
     * Find the matching closing parenthesis for an opening parenthesis
     * @param text The text to search in
     * @param openPos The position of the opening parenthesis
     * @returns Position of matching closing paren, or -1 if not found
     */
    static findMatchingCloseParen(text: string, openPos: number): number {
        let depth = 1;
        let inString = false;
        let stringChar = '';

        for (let i = openPos + 1; i < text.length; i++) {
            const char = text[i];
            const prevChar = i > 0 ? text[i - 1] : '';

            // Track strings to avoid counting parens inside strings
            if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
            }

            if (!inString) {
                if (char === '(') {
                    depth++;
                } else if (char === ')') {
                    depth--;
                    if (depth === 0) {
                        return i;
                    }
                }
            }
        }

        return -1; // No matching close paren found
    }

    /**
     * Check if a position is inside balanced parentheses
     * @param text The text to search in
     * @param position The position to check
     * @returns True if position is inside parentheses
     */
    static isInsideParens(text: string, position: number): boolean {
        let depth = 0;
        let inString = false;
        let stringChar = '';

        for (let i = 0; i < position; i++) {
            const char = text[i];
            const prevChar = i > 0 ? text[i - 1] : '';

            if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
            }

            if (!inString) {
                if (char === '(') {
                    depth++;
                } else if (char === ')') {
                    depth--;
                }
            }
        }

        return depth > 0;
    }
}
