import { randomBytes } from 'crypto';
import { db } from '../database/connection';
import { logger } from '../config/logger';
import { 
  Team, 
  TeamMembership, 
  CreateTeamData,
  PaginatedResponse,
  PaginationParams,
  TenantContext
} from '../types';
import { dataAccessService } from './data-access.service';
import { accessControlService } from './access-control.service';
import { createTenantQueryFromContext } from '../database/tenant-query-builder';

export interface CreateTeamRequest {
  name: string;
  description?: string;
}

export interface UpdateTeamRequest {
  name?: string;
  description?: string;
}

export interface TeamMember {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  addedBy: string;
  addedByName?: string;
  createdAt: Date;
}

export interface TeamWithMemberCount extends Team {
  memberCount: number;
}

/**
 * Tenant-aware team service that demonstrates proper use of the multi-tenant data access layer
 * This service ensures all operations are properly scoped to the organization context
 */
export class TenantAwareTeamService {
  /**
   * Create a new team within the tenant context
   */
  async createTeam(
    tenantContext: TenantContext,
    createdBy: string,
    teamData: CreateTeamRequest
  ): Promise<Team> {
    const { name, description } = teamData;
    const { organizationId } = tenantContext;

    // Validate that the creator has permission to create teams
    const canCreate = await accessControlService.canPerformAction(
      createdBy,
      organizationId,
      'team:create' as any
    );

    if (!canCreate) {
      throw new Error('Insufficient permissions to create team');
    }

    // Check if team name already exists in the organization using tenant query
    const existingTeam = await createTenantQueryFromContext<Team>('teams', tenantContext)
      .where('name', name)
      .first();

    if (existingTeam) {
      throw new Error('Team name already exists in this organization');
    }

    // Generate team ID
    const teamId = randomBytes(16).toString('hex');

    const createTeamData: CreateTeamData = {
      organizationId,
      name,
      createdBy,
    };

    if (description) {
      createTeamData.description = description;
    }

    // Create team using data access service
    const newTeam = await dataAccessService.createOrganizationScopedRecord<Team>(
      'teams',
      {
        ...createTeamData,
      },
      organizationId
    );

    logger.info(
      { teamId, organizationId, createdBy, name: newTeam.name }, 
      'Team created successfully with tenant context'
    );

    return newTeam;
  }

  /**
   * Get team by ID with tenant context validation
   */
  async getTeamById(tenantContext: TenantContext, teamId: string): Promise<Team | null> {
    const team = await dataAccessService.validateRecordOwnership<Team>(
      'teams',
      teamId,
      tenantContext.organizationId
    );

    if (team) {
      logger.debug({
        teamId,
        organizationId: tenantContext.organizationId,
        userId: tenantContext.userId,
      }, 'Retrieved team with tenant context validation');
    }

    return team;
  }

  /**
   * Get teams for the organization using tenant-aware queries
   */
  async getOrganizationTeams(
    tenantContext: TenantContext,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<TeamWithMemberCount>> {
    // Create tenant-scoped query with member count
    const baseQuery = createTenantQueryFromContext<Team>('teams', tenantContext)
      .select('teams.*')
      .getQuery()
      .select([
        'teams.*',
        db.raw('COUNT(team_memberships.id) as member_count')
      ])
      .leftJoin('team_memberships', 'teams.id', 'team_memberships.team_id')
      .groupBy('teams.id');

    const result = await dataAccessService.executePaginatedQuery<Team>(baseQuery, pagination);

    // Transform results to include member count
    const teamsWithMemberCount: TeamWithMemberCount[] = result.data.map(team => ({
      ...team,
      memberCount: parseInt((team as any).member_count || '0', 10),
    }));

    logger.debug({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      teamCount: teamsWithMemberCount.length,
    }, 'Retrieved organization teams with tenant context');

    return {
      ...result,
      data: teamsWithMemberCount,
    };
  }

  /**
   * Update team with tenant context validation
   */
  async updateTeam(
    tenantContext: TenantContext,
    teamId: string,
    updateData: UpdateTeamRequest
  ): Promise<Team | null> {
    // Validate team ownership and get current team
    const currentTeam = await this.getTeamById(tenantContext, teamId);
    if (!currentTeam) {
      return null;
    }

    // Check if new name conflicts with existing team in the same organization
    if (updateData.name && updateData.name !== currentTeam.name) {
      const existingTeam = await createTenantQueryFromContext<Team>('teams', tenantContext)
        .where('name', updateData.name)
        .first();

      if (existingTeam) {
        throw new Error('Team name already exists in this organization');
      }
    }

    // Update using data access service
    const updatedTeam = await dataAccessService.updateOrganizationScopedRecord<Team>(
      'teams',
      teamId,
      updateData,
      tenantContext.organizationId
    );

    if (updatedTeam) {
      logger.info({
        teamId,
        organizationId: tenantContext.organizationId,
        userId: tenantContext.userId,
      }, 'Team updated with tenant context validation');
    }

    return updatedTeam;
  }

  /**
   * Delete team with tenant context validation
   */
  async deleteTeam(tenantContext: TenantContext, teamId: string): Promise<boolean> {
    const success = await dataAccessService.deleteOrganizationScopedRecord(
      'teams',
      teamId,
      tenantContext.organizationId
    );

    if (success) {
      logger.info({
        teamId,
        organizationId: tenantContext.organizationId,
        userId: tenantContext.userId,
      }, 'Team deleted with tenant context validation');
    }

    return success;
  }

  /**
   * Add member to team with comprehensive validation
   */
  async addTeamMember(
    tenantContext: TenantContext,
    teamId: string,
    userId: string,
    addedBy: string
  ): Promise<TeamMembership> {
    // Validate team access
    const { hasAccess, team } = await accessControlService.validateTeamAccess(addedBy, teamId);
    
    if (!hasAccess || !team) {
      throw new Error('Team not found or access denied');
    }

    // Ensure team belongs to the tenant context organization
    if (team.organizationId !== tenantContext.organizationId) {
      throw new Error('Team does not belong to the current organization context');
    }

    // Validate that the user being added has access to the organization
    const { hasAccess: userHasOrgAccess } = await accessControlService.validateOrganizationAccess(
      userId,
      tenantContext.organizationId
    );

    if (!userHasOrgAccess) {
      throw new Error('User must be a member of the organization to join the team');
    }

    // Check if user is already a team member using tenant query
    const existingMembership = await createTenantQueryFromContext<TeamMembership>('team_memberships', tenantContext)
      .where('teamId', teamId)
      .where('userId', userId)
      .first();

    if (existingMembership) {
      throw new Error('User is already a member of this team');
    }

    // Generate team membership ID
    const membershipId = randomBytes(16).toString('hex');

    // Create team membership using direct database insert since team_memberships doesn't have organizationId
    await db('team_memberships').insert({
      id: membershipId,
      teamId,
      userId,
      addedBy,
      createdAt: new Date(),
    });

    // Fetch the created team membership
    const teamMembership = await db<TeamMembership>('team_memberships')
      .where('id', membershipId)
      .first();

    if (!teamMembership) {
      throw new Error('Failed to add team member');
    }

    logger.info(
      { teamId, userId, addedBy, organizationId: tenantContext.organizationId }, 
      'User added to team with tenant context validation'
    );

    return teamMembership;
  }

  /**
   * Search teams within the organization using tenant-aware search
   */
  async searchTeams(
    tenantContext: TenantContext,
    searchQuery: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<TeamWithMemberCount>> {
    // Use data access service for organization-scoped search
    const result = await dataAccessService.searchOrganizationRecords<Team>(
      'teams',
      tenantContext.organizationId,
      ['name', 'description'],
      searchQuery,
      pagination
    );

    // For this example, we'll get member counts in a separate query
    // In a real implementation, you might want to optimize this with a single query
    const teamsWithMemberCount: TeamWithMemberCount[] = await Promise.all(
      result.data.map(async (team) => {
        const memberCount = await dataAccessService.countOrganizationRecords(
          'team_memberships',
          tenantContext.organizationId,
          { teamId: team.id },
          'teamId' // team_memberships doesn't have organizationId, so we filter by teamId
        );

        return {
          ...team,
          memberCount,
        };
      })
    );

    logger.debug({
      organizationId: tenantContext.organizationId,
      userId: tenantContext.userId,
      searchQuery,
      resultCount: teamsWithMemberCount.length,
    }, 'Searched teams with tenant context');

    return {
      ...result,
      data: teamsWithMemberCount,
    };
  }

  /**
   * Get user's teams within the organization using tenant context
   */
  async getUserTeams(
    tenantContext: TenantContext,
    userId: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<TeamWithMemberCount>> {
    // Validate that the user has access to the organization
    const { hasAccess } = await accessControlService.validateOrganizationAccess(
      userId,
      tenantContext.organizationId
    );

    if (!hasAccess) {
      throw new Error('User does not have access to this organization');
    }

    // Create a complex tenant-aware query to get user's teams
    const baseQuery = createTenantQueryFromContext<Team>('teams', tenantContext)
      .select('teams.*')
      .getQuery()
      .select([
        'teams.*',
        db.raw('COUNT(all_memberships.id) as member_count')
      ])
      .join('team_memberships', 'teams.id', 'team_memberships.team_id')
      .leftJoin('team_memberships as all_memberships', 'teams.id', 'all_memberships.team_id')
      .where('team_memberships.userId', userId)
      .groupBy('teams.id');

    const result = await dataAccessService.executePaginatedQuery<Team>(baseQuery, pagination);

    // Transform results to include member count
    const teamsWithMemberCount: TeamWithMemberCount[] = result.data.map(team => ({
      ...team,
      memberCount: parseInt((team as any).member_count || '0', 10),
    }));

    logger.debug({
      organizationId: tenantContext.organizationId,
      requestingUserId: tenantContext.userId,
      targetUserId: userId,
      teamCount: teamsWithMemberCount.length,
    }, 'Retrieved user teams with tenant context');

    return {
      ...result,
      data: teamsWithMemberCount,
    };
  }

  /**
   * Validate team access within tenant context
   */
  async validateTeamAccess(
    tenantContext: TenantContext,
    teamId: string
  ): Promise<{ hasAccess: boolean; team?: Team }> {
    const team = await this.getTeamById(tenantContext, teamId);
    
    if (!team) {
      return { hasAccess: false };
    }

    // Additional validation could be added here
    // For example, checking if the user is a team member for certain operations

    return { hasAccess: true, team };
  }

  /**
   * Execute a transaction within the tenant context
   */
  async executeTeamTransaction<T>(
    tenantContext: TenantContext,
    callback: (organizationId: string) => Promise<T>
  ): Promise<T> {
    return dataAccessService.executeOrganizationTransaction(
      tenantContext.organizationId,
      async (_trx, organizationId) => {
        logger.debug({
          organizationId,
          userId: tenantContext.userId,
        }, 'Executing team transaction with tenant context');

        return callback(organizationId);
      }
    );
  }
}

// Export singleton instance
export const tenantAwareTeamService = new TenantAwareTeamService();