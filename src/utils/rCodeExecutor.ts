import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface RExecutionResult<T> {
    success: boolean;
    data?: T;
    error?: string;
}

/**
 * Utility for executing R code silently and reading JSON results
 */
export class RCodeExecutor {
    /**
     * Execute R code silently and read JSON result from temp file
     * @param positronApi Positron API instance
     * @param rCode R code to execute (should write JSON to temp file)
     * @param tempFilePath Path to temp file for output
     * @returns Parsed JSON data or null on error
     */
    static async executeAndReadJSON<T>(
        positronApi: any,
        rCode: string,
        tempFilePath: string
    ): Promise<RExecutionResult<T>> {
        try {
            // Execute R code silently
            await positronApi.runtime.executeCode(
                'r',
                rCode,
                false // silent mode
            );

            // Small delay to ensure file is written
            await new Promise(resolve => setTimeout(resolve, 100));

            // Read and parse the result
            if (fs.existsSync(tempFilePath)) {
                const data = fs.readFileSync(tempFilePath, 'utf-8');
                const parsed = JSON.parse(data) as T;

                return {
                    success: true,
                    data: parsed
                };
            } else {
                return {
                    success: false,
                    error: 'Temp file not created'
                };
            }
        } catch (error: any) {
            return {
                success: false,
                error: error.message || 'Unknown error'
            };
        }
    }

    /**
     * Create a temporary file path with cleanup
     * @param prefix File prefix (e.g., 'duckdb-schema')
     * @returns Temp file path
     */
    static createTempFilePath(prefix: string): string {
        const tempDir = os.tmpdir();
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        return path.join(tempDir, `${prefix}-${timestamp}-${random}.json`);
    }

    /**
     * Clean up temp file if it exists
     * @param filePath Path to temp file
     */
    static cleanupTempFile(filePath: string): void {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    }

    /**
     * Convert file path to R-compatible format (forward slashes)
     * @param filePath File path to convert
     * @returns R-compatible path
     */
    static toRPath(filePath: string): string {
        return filePath.replace(/\\/g, '/');
    }
}
