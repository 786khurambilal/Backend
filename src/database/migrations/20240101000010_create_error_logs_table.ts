import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('error_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.uuid('organization_id').nullable(); // Nullable for system-wide errors
    table.string('request_id', 255).notNullable();
    table.string('route', 255).notNullable();
    table.string('method', 10).notNullable();
    table.integer('status_code').notNullable();
    table.text('error_message').notNullable();
    table.text('error_stack').nullable();
    table.json('meta_json').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    // Foreign keys
    table.foreign('organization_id').references('id').inTable('organizations').onDelete('CASCADE');

    // Indexes
    table.index(['request_id'], 'idx_error_logs_request');
    table.index(['organization_id', 'created_at'], 'idx_error_logs_org_created');
    table.index(['route', 'method'], 'idx_error_logs_route_method');
    table.index(['status_code'], 'idx_error_logs_status');
    table.index(['created_at'], 'idx_error_logs_created');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('error_logs');
}