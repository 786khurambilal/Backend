"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var env_1 = require("./dist/config/env");
var config = {
    development: {
        client: 'mysql2',
        connection: {
            host: env_1.env.DB_HOST,
            port: env_1.env.DB_PORT,
            user: env_1.env.DB_USER,
            password: env_1.env.DB_PASSWORD,
            database: env_1.env.DB_NAME,
        },
        pool: {
            min: 2,
            max: env_1.env.DB_CONNECTION_LIMIT,
        },
        migrations: {
            directory: './src/database/migrations',
            extension: 'ts',
        },
        seeds: {
            directory: './src/database/seeds',
            extension: 'ts',
        },
    },
    test: {
        client: 'mysql2',
        connection: {
            host: env_1.env.DB_HOST,
            port: env_1.env.DB_PORT,
            user: env_1.env.DB_USER,
            password: env_1.env.DB_PASSWORD,
            database: "".concat(env_1.env.DB_NAME, "_test"),
        },
        pool: {
            min: 1,
            max: 5,
        },
        migrations: {
            directory: './src/database/migrations',
            extension: 'ts',
        },
        seeds: {
            directory: './src/database/seeds',
            extension: 'ts',
        },
    },
    production: {
        client: 'mysql2',
        connection: {
            host: env_1.env.DB_HOST,
            port: env_1.env.DB_PORT,
            user: env_1.env.DB_USER,
            password: env_1.env.DB_PASSWORD,
            database: env_1.env.DB_NAME,
            ssl: env_1.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        },
        pool: {
            min: 2,
            max: env_1.env.DB_CONNECTION_LIMIT,
        },
        migrations: {
            directory: './dist/database/migrations',
            extension: 'js',
        },
        seeds: {
            directory: './dist/database/seeds',
            extension: 'js',
        },
    },
};
exports.default = config;
