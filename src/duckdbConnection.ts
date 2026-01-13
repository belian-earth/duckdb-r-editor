import * as vscode from 'vscode';
import * as duckdb from 'duckdb';

export interface TableSchema {
    name: string;
    columns: ColumnInfo[];
}

export interface ColumnInfo {
    name: string;
    type: string;
    nullable: boolean;
}

export class DuckDBConnectionManager implements vscode.Disposable {
    private db: duckdb.Database | null = null;
    private connection: duckdb.Connection | null = null;
    private schema: Map<string, TableSchema> = new Map();
    private dbPath: string | null = null;

    async connect(path: string): Promise<void> {
        // Close existing connection
        this.dispose();

        return new Promise((resolve, reject) => {
            this.db = new duckdb.Database(path, (err: Error | null) => {
                if (err) {
                    reject(err);
                    return;
                }

                // Connect returns a Connection object directly
                this.connection = this.db!.connect();
                this.dbPath = path;

                // Load schema
                this.refreshSchema()
                    .then(() => resolve())
                    .catch(reject);
            });
        });
    }

    async refreshSchema(): Promise<void> {
        if (!this.connection) {
            return;
        }

        this.schema.clear();

        // Get all tables
        const tables = await this.query<{ table_name: string }>(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
        );

        // Get columns for each table
        for (const table of tables) {
            const columns = await this.query<{ column_name: string; data_type: string; is_nullable: string }>(
                `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '${table.table_name}'`
            );

            this.schema.set(table.table_name, {
                name: table.table_name,
                columns: columns.map(col => ({
                    name: col.column_name,
                    type: col.data_type,
                    nullable: col.is_nullable === 'YES'
                }))
            });
        }
    }

    getTableNames(): string[] {
        return Array.from(this.schema.keys());
    }

    getTable(name: string): TableSchema | undefined {
        return this.schema.get(name);
    }

    getColumns(tableName: string): ColumnInfo[] {
        const table = this.schema.get(tableName);
        return table ? table.columns : [];
    }

    getAllColumns(): Array<{ table: string; column: ColumnInfo }> {
        const result: Array<{ table: string; column: ColumnInfo }> = [];

        for (const [tableName, table] of this.schema.entries()) {
            for (const column of table.columns) {
                result.push({ table: tableName, column });
            }
        }

        return result;
    }

    isConnected(): boolean {
        return this.connection !== null;
    }

    getDbPath(): string | null {
        return this.dbPath;
    }

    async executeQuery(query: string): Promise<any[]> {
        if (!this.connection) {
            throw new Error('No database connection');
        }

        return this.query(query);
    }

    private query<T = any>(sql: string): Promise<T[]> {
        return new Promise((resolve, reject) => {
            if (!this.connection) {
                reject(new Error('No database connection'));
                return;
            }

            this.connection.all(sql, (err: Error | null, rows: any[]) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows as T[]);
                }
            });
        });
    }

    dispose() {
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }

        if (this.db) {
            this.db.close();
            this.db = null;
        }

        this.schema.clear();
        this.dbPath = null;
    }
}
