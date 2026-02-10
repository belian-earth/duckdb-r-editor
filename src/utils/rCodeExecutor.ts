/**
 * Utility for R code file path handling
 */
export class RCodeExecutor {
    /**
     * Convert file path to R-compatible format (forward slashes)
     * @param filePath File path to convert
     * @returns R-compatible path
     */
    static toRPath(filePath: string): string {
        return filePath.replace(/\\/g, '/');
    }
}
