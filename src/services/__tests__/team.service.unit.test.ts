import { teamService } from '../team.service';
import { db } from '../../database/connection';
import { Team, TeamMembership, Membership, MembershipStatus } from '../../types';

// Mock the database connection
jest.mock('../../database/connection', () => ({
  db: jest.fn(),
}));

// Mock the logger
jest.mock('../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockDb = db as jest.MockedFunction<any>;

describe('TeamService', () => {
  let mockQuery: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a mock query object that supports chaining
    mockQuery = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      del: jest.fn(),
      select: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
    };

    // Setup db mock to return the query object
    mockDb.mockReturnValue(mockQuery);
  });

  describe('createTeam', () => {
    it('should create a team successfully', async () => {
      const organizationId = 'org-123';
      const createdBy = 'user-123';
      const teamData = {
        name: 'Development Team',
        description: 'Main development team',
      };

      const mockTeam: Team = {
        id: 'team-123',
        organizationId,
        name: teamData.name,
        description: teamData.description,
        createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock database calls
      mockQuery.first.mockResolvedValueOnce(null); // No existing team
      mockQuery.insert.mockResolvedValueOnce(undefined);
      mockQuery.first.mockResolvedValueOnce(mockTeam); // Return created team

      const result = await teamService.createTeam(organizationId, createdBy, teamData);

      expect(result).toEqual(mockTeam);
      expect(mockQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId,
          name: teamData.name,
          description: teamData.description,
          createdBy,
        })
      );
    });

    it('should throw error if team name already exists', async () => {
      const organizationId = 'org-123';
      const createdBy = 'user-123';
      const teamData = {
        name: 'Development Team',
      };

      const existingTeam: Team = {
        id: 'existing-team-123',
        organizationId,
        name: teamData.name,
        createdBy: 'other-user',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock existing team found
      mockQuery.first.mockResolvedValueOnce(existingTeam);

      await expect(
        teamService.createTeam(organizationId, createdBy, teamData)
      ).rejects.toThrow('Team name already exists in this organization');
    });
  });

  describe('getTeamById', () => {
    it('should return team when found', async () => {
      const teamId = 'team-123';
      const mockTeam: Team = {
        id: teamId,
        organizationId: 'org-123',
        name: 'Development Team',
        createdBy: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockQuery.first.mockResolvedValueOnce(mockTeam);

      const result = await teamService.getTeamById(teamId);

      expect(result).toEqual(mockTeam);
      expect(mockQuery.where).toHaveBeenCalledWith({ id: teamId });
    });

    it('should return null when team not found', async () => {
      const teamId = 'non-existent-team';

      mockQuery.first.mockResolvedValueOnce(undefined);

      const result = await teamService.getTeamById(teamId);

      expect(result).toBeNull();
    });
  });

  describe('addTeamMember', () => {
    it('should add team member successfully', async () => {
      const teamId = 'team-123';
      const userId = 'user-123';
      const addedBy = 'admin-123';

      const mockTeam: Team = {
        id: teamId,
        organizationId: 'org-123',
        name: 'Development Team',
        createdBy: 'creator-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockOrgMembership: Membership = {
        id: 'membership-123',
        userId,
        organizationId: 'org-123',
        role: 'MEMBER' as any,
        status: MembershipStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockTeamMembership: TeamMembership = {
        id: 'team-membership-123',
        teamId,
        userId,
        addedBy,
        createdAt: new Date(),
      };

      // Mock database calls
      mockQuery.first
        .mockResolvedValueOnce(mockTeam) // Team exists
        .mockResolvedValueOnce(mockOrgMembership) // User is org member
        .mockResolvedValueOnce(null) // No existing team membership
        .mockResolvedValueOnce(mockTeamMembership); // Return created membership

      mockQuery.insert.mockResolvedValueOnce(undefined);

      const result = await teamService.addTeamMember(teamId, userId, addedBy);

      expect(result).toEqual(mockTeamMembership);
      expect(mockQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId,
          userId,
          addedBy,
        })
      );
    });

    it('should throw error if team not found', async () => {
      const teamId = 'non-existent-team';
      const userId = 'user-123';
      const addedBy = 'admin-123';

      mockQuery.first.mockResolvedValueOnce(null); // Team not found

      await expect(
        teamService.addTeamMember(teamId, userId, addedBy)
      ).rejects.toThrow('Team not found');
    });

    it('should throw error if user is not organization member', async () => {
      const teamId = 'team-123';
      const userId = 'user-123';
      const addedBy = 'admin-123';

      const mockTeam: Team = {
        id: teamId,
        organizationId: 'org-123',
        name: 'Development Team',
        createdBy: 'creator-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockQuery.first
        .mockResolvedValueOnce(mockTeam) // Team exists
        .mockResolvedValueOnce(null); // User is not org member

      await expect(
        teamService.addTeamMember(teamId, userId, addedBy)
      ).rejects.toThrow('User must be a member of the organization to join the team');
    });

    it('should throw error if user is already team member', async () => {
      const teamId = 'team-123';
      const userId = 'user-123';
      const addedBy = 'admin-123';

      const mockTeam: Team = {
        id: teamId,
        organizationId: 'org-123',
        name: 'Development Team',
        createdBy: 'creator-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockOrgMembership: Membership = {
        id: 'membership-123',
        userId,
        organizationId: 'org-123',
        role: 'MEMBER' as any,
        status: MembershipStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockExistingTeamMembership: TeamMembership = {
        id: 'existing-team-membership-123',
        teamId,
        userId,
        addedBy: 'previous-admin',
        createdAt: new Date(),
      };

      mockQuery.first
        .mockResolvedValueOnce(mockTeam) // Team exists
        .mockResolvedValueOnce(mockOrgMembership) // User is org member
        .mockResolvedValueOnce(mockExistingTeamMembership); // User already team member

      await expect(
        teamService.addTeamMember(teamId, userId, addedBy)
      ).rejects.toThrow('User is already a member of this team');
    });
  });

  describe('removeTeamMember', () => {
    it('should remove team member successfully', async () => {
      const teamId = 'team-123';
      const userId = 'user-123';

      const mockTeamMembership: TeamMembership = {
        id: 'team-membership-123',
        teamId,
        userId,
        addedBy: 'admin-123',
        createdAt: new Date(),
      };

      mockQuery.first.mockResolvedValueOnce(mockTeamMembership);
      mockQuery.del.mockResolvedValueOnce(1);

      await teamService.removeTeamMember(teamId, userId);

      expect(mockQuery.del).toHaveBeenCalled();
    });

    it('should throw error if team membership not found', async () => {
      const teamId = 'team-123';
      const userId = 'user-123';

      mockQuery.first.mockResolvedValueOnce(null);

      await expect(
        teamService.removeTeamMember(teamId, userId)
      ).rejects.toThrow('User is not a member of this team');
    });
  });

  describe('updateTeam', () => {
    it('should update team successfully', async () => {
      const teamId = 'team-123';
      const updateData = {
        name: 'Updated Team Name',
        description: 'Updated description',
      };

      const mockTeam: Team = {
        id: teamId,
        organizationId: 'org-123',
        name: 'Original Team Name',
        description: 'Original description',
        createdBy: 'creator-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockUpdatedTeam: Team = {
        ...mockTeam,
        name: updateData.name,
        description: updateData.description,
        updatedAt: new Date(),
      };

      mockQuery.first
        .mockResolvedValueOnce(mockTeam) // Original team
        .mockResolvedValueOnce(null) // No name conflict
        .mockResolvedValueOnce(mockUpdatedTeam); // Updated team

      mockQuery.update.mockResolvedValueOnce(1);

      const result = await teamService.updateTeam(teamId, updateData);

      expect(result).toEqual(mockUpdatedTeam);
      expect(mockQuery.update).toHaveBeenCalled();
    });

    it('should throw error if team not found', async () => {
      const teamId = 'non-existent-team';
      const updateData = { name: 'New Name' };

      mockQuery.first.mockResolvedValueOnce(null);

      await expect(
        teamService.updateTeam(teamId, updateData)
      ).rejects.toThrow('Team not found');
    });
  });

  describe('deleteTeam', () => {
    it('should delete team successfully', async () => {
      const teamId = 'team-123';

      const mockTeam: Team = {
        id: teamId,
        organizationId: 'org-123',
        name: 'Team to Delete',
        createdBy: 'creator-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockQuery.first.mockResolvedValueOnce(mockTeam);
      mockQuery.del.mockResolvedValueOnce(1);

      await teamService.deleteTeam(teamId);

      expect(mockQuery.del).toHaveBeenCalled();
    });

    it('should throw error if team not found', async () => {
      const teamId = 'non-existent-team';

      mockQuery.first.mockResolvedValueOnce(null);

      await expect(
        teamService.deleteTeam(teamId)
      ).rejects.toThrow('Team not found');
    });
  });
});