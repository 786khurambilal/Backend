import knex from 'knex';
import { env } from '../config/env';

// Helper functions for case conversion
const toCamelCase = (str: string): string => {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
};

const toSnakeCase = (str: string): string => {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
};

// Create database configuration
const dbConfig = {
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
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './seeds',
  },
  // Convert between camelCase and snake_case
  postProcessResponse: (result: any) => {
    if (Array.isArray(result)) {
      return result.map((row) => {
        if (typeof row === 'object' && row !== null) {
          const converted: any = {};
          for (const [key, value] of Object.entries(row)) {
            converted[toCamelCase(key)] = value;
          }
          return converted;
        }
        return row;
      });
    } else if (typeof result === 'object' && result !== null) {
      const converted: any = {};
      for (const [key, value] of Object.entries(result)) {
        converted[toCamelCase(key)] = value;
      }
      return converted;
    }
    return result;
  },
  wrapIdentifier: (value: string, origImpl: (value: string) => string) => {
    if (value === '*') return origImpl(value);
    return origImpl(toSnakeCase(value));
  },
};

// Create and export the database connection
export const db = knex(dbConfig);

// Export a function to close the connection
export const closeConnection = async (): Promise<void> => {
  await db.destroy();
};

// Export types for better TypeScript support
export type Database = typeof db;