# API Documentation

## Overview

The Multi-Tenant SaaS Backend API provides comprehensive documentation through Swagger/OpenAPI 3.0 specification. The documentation is automatically generated and includes all endpoints, request/response schemas, authentication requirements, and error responses.

## Accessing the Documentation

### Swagger UI
- **URL**: `/docs`
- **Description**: Interactive API documentation with the ability to test endpoints directly
- **Features**:
  - Browse all available endpoints organized by tags
  - View detailed request/response schemas
  - Test API endpoints directly from the browser
  - Authentication support for protected endpoints
  - Example requests and responses

### OpenAPI JSON Specification
- **URL**: `/docs.json`
- **Description**: Raw OpenAPI 3.0 specification in JSON format
- **Use Cases**:
  - Import into API testing tools (Postman, Insomnia)
  - Generate client SDKs
  - Integrate with CI/CD pipelines
  - Custom documentation generation

## API Structure

### Base Information
- **Title**: Multi-Tenant SaaS Backend API
- **Version**: 1.0.0
- **Base URL**: 
  - Development: `http://localhost:3000`
  - Production: `https://api.example.com`

### Authentication
The API uses JWT Bearer token authentication:
```
Authorization: Bearer <access_token>
```

### Endpoint Categories

#### System Endpoints
- `GET /` - API information and documentation link
- `GET /health` - System health check
- `GET /docs` - Swagger UI documentation
- `GET /docs.json` - OpenAPI specification

#### Authentication Endpoints
- `POST /auth/login` - User login
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Logout (revoke refresh token)
- `POST /auth/logout-all` - Logout from all devices
- `GET /auth/me` - Get current user information

#### User Management Endpoints
- `POST /users/register` - Register new user
- `POST /users/forgot-password` - Request password reset
- `POST /users/reset-password` - Reset password with token
- `POST /users/verify-email` - Verify email address
- `POST /users/resend-verification` - Resend verification email
- `GET /users/profile` - Get user profile
- `PUT /users/profile` - Update user profile
- `POST /users/change-password` - Change password

#### Organization Management Endpoints
- `POST /organizations` - Create organization
- `GET /organizations` - List user's organizations
- `GET /organizations/{orgId}` - Get organization details
- `PUT /organizations/{orgId}` - Update organization
- `DELETE /organizations/{orgId}` - Delete organization
- `POST /organizations/{orgId}/invite` - Invite user to organization
- `POST /organizations/accept-invitation` - Accept invitation
- `GET /organizations/{orgId}/members` - List organization members
- `PUT /organizations/{orgId}/members/{userId}` - Update member role
- `DELETE /organizations/{orgId}/members/{userId}` - Remove member
- `POST /organizations/{orgId}/transfer-ownership` - Transfer ownership

#### Team Management Endpoints
- `POST /organizations/{orgId}/teams` - Create team
- `GET /organizations/{orgId}/teams` - List organization teams
- `GET /organizations/{orgId}/teams/{teamId}` - Get team details
- `PUT /organizations/{orgId}/teams/{teamId}` - Update team
- `DELETE /organizations/{orgId}/teams/{teamId}` - Delete team
- `POST /organizations/{orgId}/teams/{teamId}/members` - Add team member
- `GET /organizations/{orgId}/teams/{teamId}/members` - List team members
- `DELETE /organizations/{orgId}/teams/{teamId}/members/{userId}` - Remove team member
- `GET /organizations/{orgId}/users/{userId}/teams` - Get user's teams

#### Audit Log Endpoints
- `GET /organizations/{orgId}/audit-logs` - Get organization audit logs
- `GET /organizations/{orgId}/audit-logs/entity/{entityType}/{entityId}` - Get entity audit logs
- `GET /organizations/{orgId}/audit-logs/user/{userId}` - Get user audit logs
- `GET /organizations/{orgId}/audit-logs/actions` - Get available actions
- `GET /organizations/{orgId}/audit-logs/entity-types` - Get available entity types

#### Admin Endpoints
- `GET /admin/debug-routes` - List debug route configurations
- `POST /admin/debug-routes` - Create debug route configuration
- `PUT /admin/debug-routes/{id}` - Update debug route configuration
- `DELETE /admin/debug-routes/{id}` - Delete debug route configuration
- `POST /admin/debug-routes/refresh` - Refresh debug routes cache
- `GET /admin/error-logs` - Get error logs with filtering
- `GET /admin/error-logs/{id}` - Get specific error log
- `GET /admin/error-logs/request/{requestId}` - Get error logs by request ID
- `GET /admin/error-logs/statistics` - Get error statistics
- `DELETE /admin/error-logs/cleanup` - Delete old error logs

## Response Formats

### Success Response
```json
{
  "success": true,
  "data": {
    // Response data
  },
  "message": "Operation completed successfully"
}
```

### Error Response
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      // Additional error details
    },
    "requestId": "req_123456789",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Paginated Response
```json
{
  "success": true,
  "data": [
    // Array of items
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

## Common HTTP Status Codes

- `200 OK` - Request successful
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid request data or validation error
- `401 Unauthorized` - Authentication required or invalid credentials
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

## Authentication Flow

1. **Register or Login**: Use `/users/register` or `/auth/login` to get tokens
2. **Use Access Token**: Include in Authorization header for protected endpoints
3. **Refresh Token**: Use `/auth/refresh` when access token expires
4. **Logout**: Use `/auth/logout` or `/auth/logout-all` to revoke tokens

## Rate Limiting

Authentication endpoints have rate limiting to prevent abuse:
- Login attempts: Limited per IP address
- Registration attempts: Limited per IP address
- Password reset requests: Limited per IP address

## Multi-Tenant Architecture

The API follows a multi-tenant architecture where:
- Organizations serve as tenant boundaries
- Users can belong to multiple organizations
- Data is automatically scoped to the user's organization context
- Role-based permissions control access within organizations

## Testing the API

### Using Swagger UI
1. Navigate to `/docs` in your browser
2. Click "Authorize" to enter your JWT token
3. Expand endpoint categories to view available operations
4. Click "Try it out" on any endpoint to test it directly

### Using curl
```bash
# Login to get tokens
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Use access token for protected endpoints
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer <access_token>"
```

### Using Postman
1. Import the OpenAPI specification from `/docs.json`
2. Set up authentication with JWT Bearer token
3. Test endpoints with automatic request/response validation

## Development

### Adding New Endpoints
When adding new endpoints, ensure you:
1. Add comprehensive Swagger documentation comments
2. Include all request/response schemas
3. Document authentication requirements
4. Add appropriate error responses
5. Update the API documentation

### Documentation Standards
- Use clear, descriptive summaries and descriptions
- Include examples for all request/response schemas
- Document all query parameters and path parameters
- Specify authentication requirements per endpoint
- Include all possible error responses with descriptions

## Support

For API support and questions:
- Review the interactive documentation at `/docs`
- Check the OpenAPI specification at `/docs.json`
- Refer to error response codes and messages
- Contact API support at support@example.com