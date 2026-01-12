import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    table.uuid('organization_id').notNullable();
    table.uuid('actor_user_id').notNullable();
    table.string('action', 100).notNullable();
    table.string('entity_type', 50).notNullable();
    table.string('entity_id', 255).notNullable();
    table.json('before_json').nullable();
    table.json('after_json').nullable();
    table.string('ip_address', 45).notNullable(); // IPv6 compatible
    table.text('user_agent').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    // Foreign keys
    table.foreign('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.foreign('actor_user_id').references('id').inTable('users').onDelete('RESTRICT');

    // Indexes
    table.index(['organization_id', 'created_at'], 'idx_audit_logs_org_created');
    table.index(['actor_user_id'], 'idx_audit_logs_actor');
    table.index(['entity_type', 'entity_id'], 'idx_audit_logs_entity');
    table.index(['action'], 'idx_audit_logs_action');
    table.index(['created_at'], 'idx_audit_logs_created');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('audit_logs');
}