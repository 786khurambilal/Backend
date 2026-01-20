import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Remove the global unique constraint on email from users table
  await knex.schema.alterTable('users', (table) => {
    table.dropUnique(['email'], 'users_email_unique');
  });

  // Add organization_id to users table to enable organization-scoped users
  await knex.schema.alterTable('users', (table) => {
    table.uuid('organization_id').nullable();
    table.foreign('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
  });

  // For existing users, we need to set their organization_id based on their memberships
  // This handles the migration of existing data
  await knex.raw(`
    UPDATE users u
    JOIN memberships m ON u.id = m.user_id
    SET u.organization_id = m.organization_id
    WHERE u.organization_id IS NULL
  `);

  // Create composite unique constraint: email + organization_id
  // This allows same email across different organizations, but prevents duplicates within same org
  await knex.schema.alterTable('users', (table) => {
    table.unique(['email', 'organization_id'], 'idx_users_email_org_unique');
    table.index(['organization_id'], 'idx_users_organization');
  });

  // Note: We keep organization_id nullable to support users without organizations
  // This provides flexibility for different use cases
}

export async function down(knex: Knex): Promise<void> {
  // Remove the composite unique constraint and organization_id from users
  await knex.schema.alterTable('users', (table) => {
    table.dropUnique(['email', 'organization_id'], 'idx_users_email_org_unique');
    table.dropIndex(['organization_id'], 'idx_users_organization');
    table.dropForeign(['organization_id']);
    table.dropColumn('organization_id');
  });

  // Restore the global unique constraint on email
  await knex.schema.alterTable('users', (table) => {
    table.unique(['email'], 'users_email_unique');
  });
}