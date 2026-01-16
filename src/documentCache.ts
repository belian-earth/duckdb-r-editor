import * as vscode from 'vscode';
import { PARSING_LIMITS } from './types';

/**
 * Represents a cached SQL region in a document
 */
export interface CachedSQLRegion {
    range: vscode.Range;
    functionName: string;
    isMultiline: boolean;
    isGlueString: boolean;
    sqlText: string;
}

/**
 * Document cache for parsed SQL regions
 * Avoids expensive re-parsing on every keystroke and provides crash protection
 */
export class DocumentCache {
    private cache: Map<string, {
        version: number;
        regions: CachedSQLRegion[];
        parseTimestamp: number;
    }>;

    constructor() {
        this.cache = new Map();
    }

    /**
     * Get cached SQL regions for a document
     * Returns null if cache is invalid or expired
     */
    public getCachedRegions(document: vscode.TextDocument): CachedSQLRegion[] | null {
        const key = this.getDocumentKey(document);
        const cached = this.cache.get(key);

        if (!cached) {
            return null;
        }

        // Check if document version matches (invalidate if document changed)
        if (cached.version !== document.version) {
            this.cache.delete(key);
            return null;
        }

        // Check if cache is expired (optional time-based invalidation)
        const now = Date.now();
        if (now - cached.parseTimestamp > PARSING_LIMITS.CACHE_EXPIRY_MS) {
            this.cache.delete(key);
            return null;
        }

        return cached.regions;
    }

    /**
     * Update cache with new SQL regions for a document
     */
    public updateCache(document: vscode.TextDocument, regions: CachedSQLRegion[]): void {
        const key = this.getDocumentKey(document);
        this.cache.set(key, {
            version: document.version,
            regions: regions,
            parseTimestamp: Date.now()
        });
    }

    /**
     * Invalidate cache for a specific document
     */
    public invalidateDocument(document: vscode.TextDocument): void {
        const key = this.getDocumentKey(document);
        this.cache.delete(key);
    }

    /**
     * Clear entire cache
     */
    public clearAll(): void {
        this.cache.clear();
    }

    /**
     * Find SQL region at a specific position using cache
     */
    public findRegionAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): CachedSQLRegion | null {
        const regions = this.getCachedRegions(document);
        if (!regions) {
            return null;
        }

        // Find region that contains the position
        for (const region of regions) {
            if (region.range.contains(position)) {
                return region;
            }
        }

        return null;
    }

    /**
     * Get all SQL regions in a document (from cache or parse)
     * This is used by the semantic token provider
     */
    public getAllRegions(document: vscode.TextDocument): CachedSQLRegion[] {
        // Try cache first
        const cached = this.getCachedRegions(document);
        if (cached) {
            return cached;
        }

        // Cache miss - caller should parse and update cache
        return [];
    }

    /**
     * Generate unique key for document
     */
    private getDocumentKey(document: vscode.TextDocument): string {
        return document.uri.toString();
    }

    /**
     * Get cache statistics (for debugging)
     */
    public getStats(): { size: number; keys: string[] } {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}
