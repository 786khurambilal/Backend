import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable('refresh_tokens', (table) => {
    table.timestamp('updated_at').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable('refresh_tokens', (table) => {
    table.dropColumn('updated_at');
  });
}