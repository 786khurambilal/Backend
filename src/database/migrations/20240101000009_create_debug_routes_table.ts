import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('debug_routes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.string('route_pattern', 255).notNullable();
    table.boolean('enabled').defaultTo(true);
    table.uuid('created_by').notNullable();
    table.timestamps(true, true);

    // Foreign keys
    table.foreign('created_by').references('id').inTable('users').onDelete('RESTRICT');

    // Indexes
    table.index(['route_pattern'], 'idx_debug_routes_pattern');
    table.index(['enabled'], 'idx_debug_routes_enabled');
    table.index(['created_by'], 'idx_debug_routes_created_by');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('debug_routes');
}