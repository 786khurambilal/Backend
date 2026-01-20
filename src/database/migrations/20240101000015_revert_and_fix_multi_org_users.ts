import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Check if organization_id column exists and remove it
  const hasOrgColumn = await knex.schema.hasColumn('users', 'organization_id');
  
  if (hasOrgColumn) {
    // Remove foreign key constraint and organization_id column
    await knex.schema.alterTable('users', (table) => {
      table.dropForeign(['organization_id']);
      table.dropIndex(['organization_id'], 'idx_users_organization');
      table.dropColumn('organization_id');
    });
  }

  // Check if global email unique constraint exists, if not add it
  const indexes = await knex.raw("SHOW INDEX FROM users WHERE Key_name = 'users_email_unique'");
  if (indexes[0].length === 0) {
    await knex.schema.alterTable('users', (table) => {
      table.unique(['email'], 'users_email_unique');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Remove the global unique constraint on email
  await knex.schema.alterTable('users', (table) => {
    table.dropUnique(['email'], 'users_email_unique');
  });

  // Add organization_id back to users table
  await knex.schema.alterTable('users', (table) => {
    table.uuid('organization_id').nullable();
    table.foreign('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.index(['organization_id'], 'idx_users_organization');
  });
}