import { randomBytes } from 'crypto';
import { db } from '../database/connection';
import { emailService } from './email.service';
import { logger } from '../config/logger';
import { 
  Organization, 
  CreateOrganizationData, 
  Membership, 
  Invitation, 
  User, 
  Role, 
  MembershipStatus,
  PaginatedResponse,
  PaginationParams
} from '../types';

export interface CreateOrganizationRequest {
  name: string;
  slug?: string;
  description?: string;
  settings?: {
    allowPublicSignup?: boolean;
    defaultRole?: Role;
  };
}

export interface UpdateOrganizationRequest {
  name?: string;
  description?: string;
  settings?: {
    allowPublicSignup?: boolean;
    defaultRole?: Role;
  };
}

export interface InviteUserRequest {
  email: string;
  role: Role;
}

export interface UpdateMemberRoleRequest {
  role: Role;
}

export interface TransferOwnershipRequest {
  newOwnerId: string;
}

export interface OrganizationMember {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  status: MembershipStatus;
  joinedAt?: Date;
  invitedBy?: string;
  inviterName?: string;
}

export interface OrganizationWithMemberCount extends Organization {
  memberCount: number;
}

export class OrganizationService {
  /**
   * Create a new organization
   */
  async createOrganization(
    ownerId: string, 
    orgData: CreateOrganizationRequest
  ): Promise<Organization> {
    const { name, slug, settings } = orgData;

    // Generate organization ID
    const organizationId = randomBytes(16).toString('hex');

    // Generate slug if not provided
    const finalSlug = slug || this.generateSlug(name);

    // Check if slug is already taken
    const existingOrg = await db<Organization>('organizations')
      .where({ slug: finalSlug })
      .first();

    if (existingOrg) {
      throw new Error('Organization slug already exists');
    }

    // Default organization settings
    const defaultSettings = {
      allowPublicSignup: false,
      defaultRole: Role.MEMBER,
      ...settings,
    };

    const createOrgData: CreateOrganizationData = {
      name,
      slug: finalSlug,
      ownerId,
      settings: defaultSettings,
    };

    // Create organization and owner membership in a transaction
    await db.transaction(async (trx) => {
      // Create organization
      await trx<Organization>('organizations').insert({
        id: organizationId,
        ...createOrgData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create owner membership
      const membershipId = randomBytes(16).toString('hex');
      await trx<Membership>('memberships').insert({
        id: membershipId,
        userId: ownerId,
        organizationId,
        role: Role.OWNER,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    // Fetch the created organization
    const newOrganization = await db<Organization>('organizations')
      .where({ id: organizationId })
      .first();

    if (!newOrganization) {
      throw new Error('Failed to create organization');
    }

    logger.info(
      { organizationId, ownerId, name: newOrganization.name }, 
      'Organization created successfully'
    );

    return newOrganization;
  }

  /**
   * Get organization by ID
   */
  async getOrganizationById(organizationId: string): Promise<Organization | null> {
    const organization = await db<Organization>('organizations')
      .where({ id: organizationId })
      .first();

    return organization || null;
  }

  /**
   * Get organization by slug
   */
  async getOrganizationBySlug(slug: string): Promise<Organization | null> {
    const organization = await db<Organization>('organizations')
      .where({ slug })
      .first();

    return organization || null;
  }

  /**
   * Get organizations for a user
   */
  async getUserOrganizations(userId: string): Promise<OrganizationWithMemberCount[]> {
    const organizations = await db<Organization>('organizations')
      .select([
        'organizations.*',
        db.raw('COUNT(memberships.id) as member_count')
      ])
      .join('memberships', 'organizations.id', 'memberships.organization_id')
      .where('memberships.user_id', userId)
      .where('memberships.status', MembershipStatus.ACTIVE)
      .groupBy('organizations.id')
      .orderBy('organizations.name');

    return organizations.map(org => ({
      ...org,
      memberCount: parseInt((org as any).member_count || '0', 10),
    }));
  }

  /**
   * Update organization
   */
  async updateOrganization(
    organizationId: string, 
    updateData: UpdateOrganizationRequest
  ): Promise<Organization> {
    const organization = await this.getOrganizationById(organizationId);
    if (!organization) {
      throw new Error('Organization not found');
    }

    // Merge settings if provided
    const updatedSettings = updateData.settings 
      ? { ...organization.settings, ...updateData.settings }
      : organization.settings;

    // Update organization
    await db<Organization>('organizations')
      .where({ id: organizationId })
      .update({
        name: updateData.name || organization.name,
        settings: updatedSettings,
        updatedAt: new Date(),
      });

    // Fetch updated organization
    const updatedOrganization = await this.getOrganizationById(organizationId);
    if (!updatedOrganization) {
      throw new Error('Failed to update organization');
    }

    logger.info({ organizationId }, 'Organization updated successfully');

    return updatedOrganization;
  }

  /**
   * Delete organization
   */
  async deleteOrganization(organizationId: string): Promise<void> {
    const organization = await this.getOrganizationById(organizationId);
    if (!organization) {
      throw new Error('Organization not found');
    }

    // Delete organization (cascading deletes will handle memberships, teams, etc.)
    await db<Organization>('organizations')
      .where({ id: organizationId })
      .del();

    logger.info({ organizationId }, 'Organization deleted successfully');
  }

  /**
   * Invite user to organization
   */
  async inviteUser(
    organizationId: string,
    inviterId: string,
    inviteData: InviteUserRequest
  ): Promise<Invitation> {
    const { email, role } = inviteData;

    // Check if organization exists
    const organization = await this.getOrganizationById(organizationId);
    if (!organization) {
      throw new Error('Organization not found');
    }

    // Check if user is already a member
    const existingUser = await db<User>('users')
      .where({ email })
      .first();

    if (existingUser) {
      const existingMembership = await db<Membership>('memberships')
        .where({
          userId: existingUser.id,
          organizationId,
        })
        .first();

      if (existingMembership) {
        throw new Error('User is already a member of this organization');
      }
    }

    // Check for existing pending invitation
    const existingInvitation = await db<Invitation>('invitations')
      .where({
        organizationId,
        email,
      })
      .where('expiresAt', '>', new Date())
      .whereNull('acceptedAt')
      .first();

    if (existingInvitation) {
      throw new Error('User already has a pending invitation');
    }

    // Generate invitation
    const invitationId = randomBytes(16).toString('hex');
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setTime(expiresAt.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Create invitation
    await db<Invitation>('invitations').insert({
      id: invitationId,
      organizationId,
      email,
      role,
      token,
      expiresAt,
      invitedBy: inviterId,
      createdAt: new Date(),
    });

    // Fetch the created invitation
    const invitation = await db<Invitation>('invitations')
      .where({ id: invitationId })
      .first();

    if (!invitation) {
      throw new Error('Failed to create invitation');
    }

    // Send invitation email
    try {
      // Get inviter's name for the email
      const inviter = await db<User>('users')
        .where({ id: inviterId })
        .first();
      
      const inviterName = inviter ? `${inviter.firstName} ${inviter.lastName}` : 'Someone';
      
      await emailService.sendInvitationEmail(
        email, 
        organization.name, 
        inviterName, 
        role, 
        token
      );
    } catch (error) {
      logger.warn(
        { organizationId, email, error }, 
        'Failed to send invitation email'
      );
      // Don't fail the invitation if email fails
    }

    logger.info(
      { organizationId, email, role, inviterId }, 
      'User invited to organization'
    );

    return invitation;
  }

  /**
   * Accept invitation
   */
  async acceptInvitation(token: string): Promise<Membership> {
    // Find valid invitation
    const invitation = await db<Invitation>('invitations')
      .where({ token })
      .where('expiresAt', '>', new Date())
      .whereNull('acceptedAt')
      .first();

    if (!invitation) {
      throw new Error('Invalid or expired invitation');
    }

    // Check if user exists, create if not
    let user = await db<User>('users')
      .where({ email: invitation.email })
      .first();

    if (!user) {
      throw new Error('User must register before accepting invitation');
    }

    // Check if user is already a member
    const existingMembership = await db<Membership>('memberships')
      .where({
        userId: user.id,
        organizationId: invitation.organizationId,
      })
      .first();

    if (existingMembership) {
      throw new Error('User is already a member of this organization');
    }

    // Create membership and mark invitation as accepted
    const membershipId = randomBytes(16).toString('hex');
    
    await db.transaction(async (trx) => {
      // Create membership
      await trx<Membership>('memberships').insert({
        id: membershipId,
        userId: user.id,
        organizationId: invitation.organizationId,
        role: invitation.role,
        status: MembershipStatus.ACTIVE,
        invitedBy: invitation.invitedBy,
        joinedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mark invitation as accepted
      await trx<Invitation>('invitations')
        .where({ id: invitation.id })
        .update({
          acceptedAt: new Date(),
        });
    });

    // Fetch the created membership
    const membership = await db<Membership>('memberships')
      .where({ id: membershipId })
      .first();

    if (!membership) {
      throw new Error('Failed to create membership');
    }

    logger.info(
      { 
        organizationId: invitation.organizationId, 
        userId: user.id, 
        role: invitation.role 
      }, 
      'Invitation accepted successfully'
    );

    return membership;
  }

  /**
   * Get organization members
   */
  async getOrganizationMembers(
    organizationId: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResponse<OrganizationMember>> {
    const { page = 1, limit = 20, sortBy = 'joinedAt', sortOrder = 'desc' } = pagination || {};
    const offset = (page - 1) * limit;

    // Get total count
    const totalResult = await db<Membership>('memberships')
      .count('* as count')
      .where('organizationId', organizationId)
      .where('status', MembershipStatus.ACTIVE)
      .first() as { count: number } | undefined;

    const total = totalResult?.count || 0;

    // Get members with user details
    const members = await db<Membership>('memberships')
      .select([
        'memberships.id',
        'memberships.userId',
        'memberships.role',
        'memberships.status',
        'memberships.joinedAt',
        'memberships.invitedBy',
        'users.email',
        'users.firstName',
        'users.lastName',
        'inviters.firstName as inviterFirstName',
        'inviters.lastName as inviterLastName',
      ])
      .join('users', 'memberships.userId', 'users.id')
      .leftJoin('users as inviters', 'memberships.invitedBy', 'inviters.id')
      .where('memberships.organizationId', organizationId)
      .where('memberships.status', MembershipStatus.ACTIVE)
      .orderBy(`memberships.${sortBy}`, sortOrder)
      .limit(limit)
      .offset(offset);

    const organizationMembers: OrganizationMember[] = members.map(member => {
      const inviterName = member.inviterFirstName && member.inviterLastName 
        ? `${member.inviterFirstName} ${member.inviterLastName}`
        : undefined;
      
      return {
        id: member.id,
        userId: member.userId,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        role: member.role,
        status: member.status,
        joinedAt: member.joinedAt,
        invitedBy: member.invitedBy,
        ...(inviterName && { inviterName }),
      };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data: organizationMembers,
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
   * Update member role
   */
  async updateMemberRole(
    organizationId: string,
    userId: string,
    updateData: UpdateMemberRoleRequest
  ): Promise<Membership> {
    const { role } = updateData;

    // Find membership
    const membership = await db<Membership>('memberships')
      .where({
        userId,
        organizationId,
        status: MembershipStatus.ACTIVE,
      })
      .first();

    if (!membership) {
      throw new Error('Membership not found');
    }

    // Prevent changing owner role (use transfer ownership instead)
    if (membership.role === Role.OWNER) {
      throw new Error('Cannot change owner role. Use transfer ownership instead.');
    }

    // Prevent setting multiple owners
    if (role === Role.OWNER) {
      throw new Error('Cannot set owner role. Use transfer ownership instead.');
    }

    // Update membership role
    await db<Membership>('memberships')
      .where({ id: membership.id })
      .update({
        role,
        updatedAt: new Date(),
      });

    // Fetch updated membership
    const updatedMembership = await db<Membership>('memberships')
      .where({ id: membership.id })
      .first();

    if (!updatedMembership) {
      throw new Error('Failed to update membership');
    }

    logger.info(
      { organizationId, userId, oldRole: membership.role, newRole: role }, 
      'Member role updated successfully'
    );

    return updatedMembership;
  }

  /**
   * Remove member from organization
   */
  async removeMember(organizationId: string, userId: string): Promise<void> {
    // Find membership
    const membership = await db<Membership>('memberships')
      .where({
        userId,
        organizationId,
        status: MembershipStatus.ACTIVE,
      })
      .first();

    if (!membership) {
      throw new Error('Membership not found');
    }

    // Prevent removing owner
    if (membership.role === Role.OWNER) {
      throw new Error('Cannot remove organization owner. Transfer ownership first.');
    }

    // Remove membership
    await db<Membership>('memberships')
      .where({ id: membership.id })
      .del();

    logger.info({ organizationId, userId }, 'Member removed from organization');
  }

  /**
   * Transfer organization ownership
   */
  async transferOwnership(
    organizationId: string,
    transferData: TransferOwnershipRequest
  ): Promise<void> {
    const { newOwnerId } = transferData;

    // Check if organization exists
    const organization = await this.getOrganizationById(organizationId);
    if (!organization) {
      throw new Error('Organization not found');
    }

    // Check if new owner is a member
    const newOwnerMembership = await db<Membership>('memberships')
      .where({
        userId: newOwnerId,
        organizationId,
        status: MembershipStatus.ACTIVE,
      })
      .first();

    if (!newOwnerMembership) {
      throw new Error('New owner must be a member of the organization');
    }

    // Transfer ownership in a transaction
    await db.transaction(async (trx) => {
      // Update current owner to admin
      await trx<Membership>('memberships')
        .where({
          organizationId,
          role: Role.OWNER,
        })
        .update({
          role: Role.ADMIN,
          updatedAt: new Date(),
        });

      // Update new owner
      await trx<Membership>('memberships')
        .where({ id: newOwnerMembership.id })
        .update({
          role: Role.OWNER,
          updatedAt: new Date(),
        });

      // Update organization owner
      await trx<Organization>('organizations')
        .where({ id: organizationId })
        .update({
          ownerId: newOwnerId,
          updatedAt: new Date(),
        });
    });

    logger.info(
      { organizationId, oldOwnerId: organization.ownerId, newOwnerId }, 
      'Organization ownership transferred successfully'
    );
  }

  /**
   * Generate slug from name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Clean up expired invitations
   */
  async cleanupExpiredInvitations(): Promise<void> {
    const deletedCount = await db<Invitation>('invitations')
      .where('expiresAt', '<', new Date())
      .del();

    if (deletedCount > 0) {
      logger.info({ deletedCount }, 'Cleaned up expired invitations');
    }
  }
}

// Export singleton instance
export const organizationService = new OrganizationService();