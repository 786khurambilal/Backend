import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('team_memberships', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.uuid('team_id').notNullable();
    table.uuid('user_id').notNullable();
    table.uuid('added_by').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    // Foreign keys
    table.foreign('team_id').references('id').inTable('teams').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('added_by').references('id').inTable('users').onDelete('RESTRICT');

    // Unique constraint - user can only be in a team once
    table.unique(['team_id', 'user_id'], 'idx_team_memberships_team_user_unique');

    // Indexes
    table.index(['team_id'], 'idx_team_memberships_team');
    table.index(['user_id'], 'idx_team_memberships_user');
    table.index(['added_by'], 'idx_team_memberships_added_by');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('team_memberships');
}