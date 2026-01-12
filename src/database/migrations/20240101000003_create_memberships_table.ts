import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('memberships', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.uuid('user_id').notNullable();
    table.uuid('organization_id').notNullable();
    table.enum('role', ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER']).notNullable();
    table.enum('status', ['PENDING', 'ACTIVE', 'SUSPENDED']).defaultTo('ACTIVE');
    table.uuid('invited_by').nullable();
    table.timestamp('joined_at').nullable();
    table.timestamps(true, true);

    // Foreign keys
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.foreign('invited_by').references('id').inTable('users').onDelete('SET NULL');

    // Unique constraint - user can only have one membership per organization
    table.unique(['user_id', 'organization_id'], 'idx_memberships_user_org_unique');

    // Indexes
    table.index(['user_id', 'organization_id'], 'idx_memberships_user_org');
    table.index(['organization_id', 'role'], 'idx_memberships_org_role');
    table.index(['organization_id', 'status'], 'idx_memberships_org_status');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('memberships');
}