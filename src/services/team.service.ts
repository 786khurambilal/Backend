import { randomBytes } from 'crypto';
import { db } from '../database/connection';
import { logger } from '../config/logger';
import { 
  Team, 
  TeamMembership, 
  Membership,
  CreateTeamData,
  PaginatedResponse,
  PaginationParams,
  MembershipStatus
} from '../types';

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

export class TeamService {
  /**
   * Create a new team within an organization
   */
  async createTeam(
    organizationId: string,
    createdBy: string,
    teamData: CreateTeamRequest
  ): Promise<Team> {
    const { name, description } = teamData;

    // Generate team ID
    const teamId = randomBytes(16).toString('hex');

    // Check if team name already exists in the organization
    const existingTeam = await db<Team>('teams')
      .where({ organizationId, name })
      .first();

    if (existingTeam) {
      throw new Error('Team name already exists in this organization');
    }

    const createTeamData: CreateTeamData = {
      organizationId,
      name,
      createdBy,
    };

    if (description) {
      createTeamData.description = description;
    }

    // Create team
    await db<Team>('teams').insert({
      id: teamId,
      ...createTeamData,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Fetch the created team
    const newTeam = await db<Team>('teams')
      .where({ id: teamId })
      .first();

    if (!newTeam) {
      throw new Error('Failed to create team');
    }

    logger.info(
      { teamId, organizationId, createdBy, name: newTeam.name }, 
      'Team created successfully'
    );

    return newTeam;
  }

  /**
   * Get team by ID
   */
  async getTeamById(teamId: string): Promise<Team | null> {
    const team = await db<Team>('teams')
      .where({ id: teamId })
      .first();

    return team || null;
  }

  /**
   * Get teams for an organization
   */
  async getOrganizationTeams(
    organizationId: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<TeamWithMemberCount>> {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = pagination || {};
    const offset = (page - 1) * limit;

    // Get total count
    const totalResult = await db<Team>('teams')
      .count('* as count')
      .where('organizationId', organizationId)
      .first() as { count: number } | undefined;

    const total = totalResult?.count || 0;

    // Get teams with member count
    const teams = await db<Team>('teams')
      .select([
        'teams.*',
        db.raw('COUNT(team_memberships.id) as member_count')
      ])
      .leftJoin('team_memberships', 'teams.id', 'team_memberships.team_id')
      .where('teams.organizationId', organizationId)
      .groupBy('teams.id')
      .orderBy(`teams.${sortBy}`, sortOrder)
      .limit(limit)
      .offset(offset);

    const teamsWithMemberCount: TeamWithMemberCount[] = teams.map(team => ({
      ...team,
      memberCount: parseInt((team as any).member_count || '0', 10),
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      data: teamsWithMemberCount,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Update team
   */
  async updateTeam(
    teamId: string,
    updateData: UpdateTeamRequest
  ): Promise<Team> {
    const team = await this.getTeamById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    // Check if new name conflicts with existing team in the same organization
    if (updateData.name && updateData.name !== team.name) {
      const existingTeam = await db<Team>('teams')
        .where({ organizationId: team.organizationId, name: updateData.name })
        .first();

      if (existingTeam) {
        throw new Error('Team name already exists in this organization');
      }
    }

    // Update team
    const updateFields: Partial<Team> = {
      name: updateData.name || team.name,
      updatedAt: new Date(),
    };

    if (updateData.description !== undefined) {
      updateFields.description = updateData.description;
    }

    await db<Team>('teams')
      .where({ id: teamId })
      .update(updateFields);

    // Fetch updated team
    const updatedTeam = await this.getTeamById(teamId);
    if (!updatedTeam) {
      throw new Error('Failed to update team');
    }

    logger.info({ teamId }, 'Team updated successfully');

    return updatedTeam;
  }

  /**
   * Delete team
   */
  async deleteTeam(teamId: string): Promise<void> {
    const team = await this.getTeamById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    // Delete team (cascading deletes will handle team memberships)
    await db<Team>('teams')
      .where({ id: teamId })
      .del();

    logger.info({ teamId }, 'Team deleted successfully');
  }

  /**
   * Add member to team
   */
  async addTeamMember(
    teamId: string,
    userId: string,
    addedBy: string
  ): Promise<TeamMembership> {
    // Check if team exists
    const team = await this.getTeamById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    // Check if user is a member of the organization
    const orgMembership = await db<Membership>('memberships')
      .where({
        userId,
        organizationId: team.organizationId,
        status: MembershipStatus.ACTIVE,
      })
      .first();

    if (!orgMembership) {
      throw new Error('User must be a member of the organization to join the team');
    }

    // Check if user is already a team member
    const existingTeamMembership = await db<TeamMembership>('team_memberships')
      .where({
        teamId,
        userId,
      })
      .first();

    if (existingTeamMembership) {
      throw new Error('User is already a member of this team');
    }

    // Generate team membership ID
    const membershipId = randomBytes(16).toString('hex');

    // Add team member
    await db<TeamMembership>('team_memberships').insert({
      id: membershipId,
      teamId,
      userId,
      addedBy,
      createdAt: new Date(),
    });

    // Fetch the created team membership
    const teamMembership = await db<TeamMembership>('team_memberships')
      .where({ id: membershipId })
      .first();

    if (!teamMembership) {
      throw new Error('Failed to add team member');
    }

    logger.info(
      { teamId, userId, addedBy }, 
      'User added to team successfully'
    );

    return teamMembership;
  }

  /**
   * Remove member from team
   */
  async removeTeamMember(teamId: string, userId: string): Promise<void> {
    // Check if team membership exists
    const teamMembership = await db<TeamMembership>('team_memberships')
      .where({
        teamId,
        userId,
      })
      .first();

    if (!teamMembership) {
      throw new Error('User is not a member of this team');
    }

    // Remove team member
    await db<TeamMembership>('team_memberships')
      .where({ id: teamMembership.id })
      .del();

    logger.info({ teamId, userId }, 'User removed from team successfully');
  }

  /**
   * Get team members
   */
  async getTeamMembers(
    teamId: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<TeamMember>> {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = pagination || {};
    const offset = (page - 1) * limit;

    // Get total count
    const totalResult = await db<TeamMembership>('team_memberships')
      .count('* as count')
      .where('teamId', teamId)
      .first() as { count: number } | undefined;

    const total = totalResult?.count || 0;

    // Get team members with user details
    const members = await db<TeamMembership>('team_memberships')
      .select([
        'team_memberships.id',
        'team_memberships.userId',
        'team_memberships.addedBy',
        'team_memberships.createdAt',
        'users.email',
        'users.firstName',
        'users.lastName',
        'adders.firstName as adderFirstName',
        'adders.lastName as adderLastName',
      ])
      .join('users', 'team_memberships.userId', 'users.id')
      .leftJoin('users as adders', 'team_memberships.addedBy', 'adders.id')
      .where('team_memberships.teamId', teamId)
      .orderBy(`team_memberships.${sortBy}`, sortOrder)
      .limit(limit)
      .offset(offset);

    const teamMembers: TeamMember[] = members.map(member => {
      const addedByName = member.adderFirstName && member.adderLastName 
        ? `${member.adderFirstName} ${member.adderLastName}`
        : undefined;
      
      return {
        id: member.id,
        userId: member.userId,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        addedBy: member.addedBy,
        ...(addedByName && { addedByName }),
        createdAt: member.createdAt,
      };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data: teamMembers,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Get teams for a user within an organization
   */
  async getUserTeams(
    userId: string,
    organizationId: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<TeamWithMemberCount>> {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = pagination || {};
    const offset = (page - 1) * limit;

    // Get total count
    const totalResult = await db<Team>('teams')
      .count('* as count')
      .join('team_memberships', 'teams.id', 'team_memberships.team_id')
      .where('teams.organizationId', organizationId)
      .where('team_memberships.userId', userId)
      .first() as { count: number } | undefined;

    const total = totalResult?.count || 0;

    // Get user's teams with member count
    const teams = await db<Team>('teams')
      .select([
        'teams.*',
        db.raw('COUNT(all_memberships.id) as member_count')
      ])
      .join('team_memberships', 'teams.id', 'team_memberships.team_id')
      .leftJoin('team_memberships as all_memberships', 'teams.id', 'all_memberships.team_id')
      .where('teams.organizationId', organizationId)
      .where('team_memberships.userId', userId)
      .groupBy('teams.id')
      .orderBy(`teams.${sortBy}`, sortOrder)
      .limit(limit)
      .offset(offset);

    const teamsWithMemberCount: TeamWithMemberCount[] = teams.map(team => ({
      ...team,
      memberCount: parseInt((team as any).member_count || '0', 10),
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      data: teamsWithMemberCount,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Search teams within an organization
   */
  async searchTeams(
    organizationId: string,
    searchQuery: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<TeamWithMemberCount>> {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = pagination || {};
    const offset = (page - 1) * limit;

    const searchPattern = `%${searchQuery}%`;

    // Get total count
    const totalResult = await db<Team>('teams')
      .count('* as count')
      .where('organizationId', organizationId)
      .where(function() {
        this.where('name', 'like', searchPattern)
          .orWhere('description', 'like', searchPattern);
      })
      .first() as { count: number } | undefined;

    const total = totalResult?.count || 0;

    // Get teams with member count
    const teams = await db<Team>('teams')
      .select([
        'teams.*',
        db.raw('COUNT(team_memberships.id) as member_count')
      ])
      .leftJoin('team_memberships', 'teams.id', 'team_memberships.team_id')
      .where('teams.organizationId', organizationId)
      .where(function() {
        this.where('teams.name', 'like', searchPattern)
          .orWhere('teams.description', 'like', searchPattern);
      })
      .groupBy('teams.id')
      .orderBy(`teams.${sortBy}`, sortOrder)
      .limit(limit)
      .offset(offset);

    const teamsWithMemberCount: TeamWithMemberCount[] = teams.map(team => ({
      ...team,
      memberCount: parseInt((team as any).member_count || '0', 10),
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      data: teamsWithMemberCount,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Check if user is a team member
   */
  async isTeamMember(teamId: string, userId: string): Promise<boolean> {
    const membership = await db<TeamMembership>('team_memberships')
      .where({
        teamId,
        userId,
      })
      .first();

    return !!membership;
  }

  /**
   * Get team with organization context
   */
  async getTeamWithOrganization(teamId: string): Promise<(Team & { organizationId: string }) | null> {
    const team = await db<Team>('teams')
      .where({ id: teamId })
      .first();

    return team || null;
  }
}

// Export singleton instance
export const teamService = new TeamService();