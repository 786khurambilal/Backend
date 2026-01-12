import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('teams', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.uuid('organization_id').notNullable();
    table.string('name', 255).notNullable();
    table.text('description').nullable();
    table.uuid('created_by').notNullable();
    table.timestamps(true, true);

    // Foreign keys
    table.foreign('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.foreign('created_by').references('id').inTable('users').onDelete('RESTRICT');

    // Indexes
    table.index(['organization_id'], 'idx_teams_organization');
    table.index(['organization_id', 'name'], 'idx_teams_org_name');
    table.index(['created_by'], 'idx_teams_created_by');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('teams');
}