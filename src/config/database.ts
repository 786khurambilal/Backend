import knex, { Knex } from 'knex';
import { env } from './env';

// Import knex config directly to avoid path issues
const knexConfig = {
  development: {
    client: 'mysql2',
    connection: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
    },
    pool: {
      min: 2,
      max: env.DB_CONNECTION_LIMIT,
    },
  },
  test: {
    client: 'mysql2',
    connection: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME, // Use same database as development
    },
    pool: {
      min: 1,
      max: 5,
    },
  },
  production: {
    client: 'mysql2',
    connection: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    },
    pool: {
      min: 2,
      max: env.DB_CONNECTION_LIMIT,
    },
  },
} as const;

class Database {
  private static instance: Database;
  private _connection: Knex | null = null;

  private constructor() {}

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  public async connect(): Promise<Knex> {
    if (this._connection) {
      return this._connection;
    }

    try {
      const config = knexConfig[env.NODE_ENV];
      this._connection = knex(config);

      // Test the connection
      await this._connection.raw('SELECT 1');

      return this._connection;
    } catch (error) {
      throw new Error(
        `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  public get connection(): Knex {
    if (!this._connection) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this._connection;
  }

  public async disconnect(): Promise<void> {
    if (this._connection) {
      await this._connection.destroy();
      this._connection = null;
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      if (!this._connection) {
        return false;
      }
      await this._connection.raw('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}

export const database = Database.getInstance();
export { Knex };
