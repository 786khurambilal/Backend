import { AuditService, AuditContext } from '../audit.service';
import { db } from '../../database/connection';

// Mock the database connection
jest.mock('../../database/connection', () => ({
  db: jest.fn(() => ({
    insert: jest.fn(),
    returning: jest.fn(),
    where: jest.fn(),
    count: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
    offset: jest.fn(),
    select: jest.fn(),
    clone: jest.fn(),
    distinct: jest.fn(),
    pluck: jest.fn(),
  })),
}));

describe('AuditService', () => {
  let auditService: AuditService;
  let mockQuery: any;

  beforeEach(() => {
    // Create a mock query object that chains methods
    mockQuery = {
      insert: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      pluck: jest.fn().mockReturnThis(),
    };

    // Mock the db function to return our mock query
    (db as any).mockReturnValue(mockQuery);
    
    auditService = new AuditService();
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('logAction', () => {
    it('should create an audit log entry', async () => {
      const mockInsertResult = {
        id: 'audit-123',
        organization_id: 'org-123',
        actor_user_id: 'user-123',
        action: 'user.created',
        entity_type: 'user',
        entity_id: 'user-456',
        before_json: null,
        after_json: { name: 'John Doe' },
        ip_address: '127.0.0.1',
        user_agent: 'test-agent',
        created_at: new Date(),
      };

      mockQuery.returning.mockResolvedValue([mockInsertResult]);

      const auditContext: AuditContext = {
        organizationId: 'org-123',
        actorUserId: 'user-123',
        action: 'user.created',
        entityType: 'user',
        entityId: 'user-456',
        afterState: { name: 'John Doe' },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      };

      const result = await auditService.logAction(auditContext);

      expect(mockQuery.insert).toHaveBeenCalledWith({
        organizationId: 'org-123',
        actorUserId: 'user-123',
        action: 'user.created',
        entityType: 'user',
        entityId: 'user-456',
        beforeJson: null,
        afterJson: { name: 'John Doe' },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });

      expect(result).toMatchObject({
        id: 'audit-123',
        organizationId: 'org-123',
        actorUserId: 'user-123',
        action: 'user.created',
        entityType: 'user',
        entityId: 'user-456',
      });
    });
  });

  describe('getAuditLogs', () => {
    it('should retrieve audit logs with pagination', async () => {
      const mockLogs = [{
        id: 'audit-123',
        organization_id: 'org-123',
        actor_user_id: 'user-123',
        action: 'user.created',
        entity_type: 'user',
        entity_id: 'user-456',
        before_json: null,
        after_json: { name: 'John Doe' },
        ip_address: '127.0.0.1',
        user_agent: 'test-agent',
        created_at: new Date(),
      }];

      // Mock count query
      mockQuery.count.mockResolvedValue([{ count: '1' }]);
      
      // Mock select query
      mockQuery.select.mockResolvedValue(mockLogs);

      const result = await auditService.getAuditLogs('org-123', {}, { page: 1, limit: 50 });

      expect(mockQuery.where).toHaveBeenCalledWith('organization_id', 'org-123');
      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(50);
    });

    it('should apply filters correctly', async () => {
      mockQuery.count.mockResolvedValue([{ count: '0' }]);
      mockQuery.select.mockResolvedValue([]);

      const filters = {
        actorUserId: 'user-123',
        action: 'user.created',
        entityType: 'user',
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-12-31'),
      };

      await auditService.getAuditLogs('org-123', filters, { page: 1, limit: 50 });

      expect(mockQuery.where).toHaveBeenCalledWith('organization_id', 'org-123');
      expect(mockQuery.where).toHaveBeenCalledWith('actor_user_id', 'user-123');
      expect(mockQuery.where).toHaveBeenCalledWith('action', 'user.created');
      expect(mockQuery.where).toHaveBeenCalledWith('entity_type', 'user');
      expect(mockQuery.where).toHaveBeenCalledWith('created_at', '>=', filters.startDate);
      expect(mockQuery.where).toHaveBeenCalledWith('created_at', '<=', filters.endDate);
    });
  });

  describe('getAvailableActions', () => {
    it('should return sorted list of available actions', async () => {
      const mockActions = ['user.created', 'user.updated', 'organization.created'];
      mockQuery.pluck.mockResolvedValue(mockActions);

      const result = await auditService.getAvailableActions('org-123');

      expect(mockQuery.where).toHaveBeenCalledWith('organization_id', 'org-123');
      expect(mockQuery.distinct).toHaveBeenCalledWith('action');
      expect(result).toEqual(mockActions);
    });
  });

  describe('getAvailableEntityTypes', () => {
    it('should return sorted list of available entity types', async () => {
      const mockEntityTypes = ['organization', 'user', 'team'];
      mockQuery.pluck.mockResolvedValue(mockEntityTypes);

      const result = await auditService.getAvailableEntityTypes('org-123');

      expect(mockQuery.where).toHaveBeenCalledWith('organization_id', 'org-123');
      expect(mockQuery.distinct).toHaveBeenCalledWith('entity_type');
      expect(result).toEqual(mockEntityTypes);
    });
  });
});