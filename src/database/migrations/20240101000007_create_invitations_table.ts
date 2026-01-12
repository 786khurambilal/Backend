import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('invitations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.uuid('organization_id').notNullable();
    table.string('email', 255).notNullable();
    table.enum('role', ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER']).notNullable();
    table.string('token', 255).notNullable().unique();
    table.timestamp('expires_at').notNullable();
    table.uuid('invited_by').notNullable();
    table.timestamp('accepted_at').nullable();
    table.timestamps(true, true);

    // Foreign keys
    table.foreign('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.foreign('invited_by').references('id').inTable('users').onDelete('RESTRICT');

    // Indexes
    table.index(['token'], 'idx_invitations_token');
    table.index(['organization_id', 'email'], 'idx_invitations_org_email');
    table.index(['expires_at'], 'idx_invitations_expires');
    table.index(['invited_by'], 'idx_invitations_invited_by');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('invitations');
}