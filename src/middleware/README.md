# Multi-Tenant Data Access Layer

This document explains how to use the multi-tenant data access layer components that ensure proper organization-scoped data isolation.

## Components

### 1. Tenant Middleware (`tenant.middleware.ts`)

Provides middleware functions for establishing and validating tenant context:

- `establishTenantContext(orgIdParam)` - Establishes organization context from request parameters
- `validateOrganizationAccess` - Validates user has access to organization
- `enforceDataIsolation` - Ensures tenant context is present
- `requireTenantContext(orgIdParam)` - Combines context establishment and isolation enforcement

### 2. Data Access Service (`data-access.service.ts`)

Provides organization-scoped database operations:

- `createOrganizationScopedQuery()` - Creates queries automatically scoped to organization
- `validateRecordOwnership()` - Validates records belong to organization
- `createOrganizationScopedRecord()` - Creates records with organization scoping
- `updateOrganizationScopedRecord()` - Updates records with ownership validation
- `deleteOrganizationScopedRecord()` - Deletes records with ownership validation
- `executePaginatedQuery()` - Executes paginated queries with organization scoping

### 3. Tenant Query Builder (`tenant-query-builder.ts`)

Provides a fluent query builder that automatically applies organization scoping:

- `createTenantQuery()` - Factory function to create tenant-scoped queries
- `createTenantQueryFromContext()` - Creates queries from tenant context
- All standard query methods (where, join, select, etc.) with automatic organization scoping

### 4. Access Control Service (`access-control.service.ts`)

Provides organization-level access validation and permission checking:

- `validateOrganizationAccess()` - Validates user membership in organization
- `getUserOrganizationPermissions()` - Gets user's permissions in organization
- `hasOrganizationPermission()` - Checks specific permission
- `createTenantContext()` - Creates tenant context for user/organization pair
- `validateTeamAccess()` - Validates access to teams within organization

## Usage Examples

### Basic Route with Tenant Context

```typescript
import { requireAuth, requireTenantContext } from '../middleware';
import { dataAccessService } from '../services/data-access.service';

// Route that requires organization context
router.get('/organizations/:orgId/teams', 
  requireAuth,
  requireTenantContext('orgId'),
  async (req, res) => {
    const { organizationId } = req;
    
    // This query is automatically scoped to the organization
    const teams = await dataAccessService.getOrganizationRecords(
      'teams',
      organizationId!,
      {},
      { page: 1, limit: 20 }
    );
    
    res.json(teams);
  }
);
```

### Using Tenant Query Builder

```typescript
import { createTenantQuery } from '../database/tenant-query-builder';

async function getTeamsWithMemberCount(organizationId: string) {
  const teams = await createTenantQuery('teams', organizationId)
    .select(['teams.*', 'COUNT(team_memberships.id) as member_count'])
    .leftJoin('team_memberships', 'teams.id', 'team_memberships.team_id')
    .groupBy('teams.id')
    .execute();
    
  return teams;
}
```

### Service with Tenant Context

```typescript
import { TenantContext } from '../types';
import { accessControlService } from '../services/access-control.service';
import { createTenantQueryFromContext } from '../database/tenant-query-builder';

class MyService {
  async createResource(tenantContext: TenantContext, data: any) {
    // Validate permissions
    const canCreate = await accessControlService.hasOrganizationPermission(
      tenantContext.userId,
      tenantContext.organizationId,
      'resource:create'
    );
    
    if (!canCreate) {
      throw new Error('Insufficient permissions');
    }
    
    // Create resource with automatic organization scoping
    const resource = await createTenantQueryFromContext('resources', tenantContext)
      .insert({
        ...data,
        createdBy: tenantContext.userId,
      });
      
    return resource;
  }
}
```

### Validating Record Ownership

```typescript
import { dataAccessService } from '../services/data-access.service';

async function updateTeam(organizationId: string, teamId: string, updateData: any) {
  // Validate the team belongs to the organization
  const team = await dataAccessService.validateRecordOwnership(
    'teams',
    teamId,
    organizationId
  );
  
  if (!team) {
    throw new Error('Team not found or access denied');
  }
  
  // Update with ownership validation
  const updatedTeam = await dataAccessService.updateOrganizationScopedRecord(
    'teams',
    teamId,
    updateData,
    organizationId
  );
  
  return updatedTeam;
}
```

## Security Considerations

1. **Always use tenant context** - Never query organization data without proper scoping
2. **Validate ownership** - Always validate record ownership before operations
3. **Use middleware** - Apply tenant middleware to all organization-scoped routes
4. **Check permissions** - Validate user permissions before allowing operations
5. **Audit access** - Log access attempts for security monitoring

## Best Practices

1. **Consistent patterns** - Use the same patterns across all services
2. **Error handling** - Provide clear error messages for access denied scenarios
3. **Performance** - Use efficient queries with proper indexing
4. **Testing** - Test data isolation thoroughly with multiple organizations
5. **Documentation** - Document tenant context requirements for all endpoints

## Testing

The multi-tenant data access layer includes comprehensive tests that verify:

- Organization-scoped queries work correctly
- Record ownership validation prevents cross-organization access
- Access control service properly validates permissions
- Tenant context creation and validation works as expected

Run tests with:
```bash
npm test -- --testPathPattern="data-access.service"
```