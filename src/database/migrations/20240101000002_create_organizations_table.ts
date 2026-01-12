import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('organizations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.string('name', 255).notNullable();
    table.string('slug', 255).notNullable().unique();
    table.uuid('owner_id').notNullable();
    table.json('settings').nullable();
    table.timestamps(true, true);

    // Foreign keys
    table.foreign('owner_id').references('id').inTable('users').onDelete('RESTRICT');

    // Indexes
    table.index(['slug'], 'idx_organizations_slug');
    table.index(['owner_id'], 'idx_organizations_owner');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('organizations');
}