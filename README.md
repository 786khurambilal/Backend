# Multi-Tenant SaaS Backend Engine

A production-ready multi-tenant SaaS backend engine built with Node.js, TypeScript, and Express.js. This system provides comprehensive tenant-wise user management, authentication, authorization, and audit capabilities with organization-based tenancy.

## 🚀 Features

- **Multi-tenant Architecture** - Organization-based tenancy with shared database, shared schema approach
- **JWT Authentication** - Secure authentication with refresh token rotation
- **Role-Based Access Control (RBAC)** - Fine-grained permissions system
- **Comprehensive Audit Logging** - Full audit trail for compliance and monitoring
- **Email Workflows** - Automated invitations, password recovery, and verification
- **Production-Ready Security** - Rate limiting, input sanitization, SQL injection prevention
- **Health Monitoring** - Kubernetes/Docker-ready health checks
- **Interactive API Documentation** - Swagger/OpenAPI 3.0 with live testing
- **Structured Logging** - JSON-based logging with Pino
- **Type Safety** - Full TypeScript with strict configuration

## 🛠 Technology Stack

### Core Technologies
- **Runtime**: Node.js 18+ with TypeScript 5.3+
- **Framework**: Express.js 4.18+
- **Database**: MySQL 8.0+ with Knex.js query builder
- **Authentication**: JWT with bcrypt password hashing
- **Email**: Nodemailer with SMTP support
- **Logging**: Pino structured JSON logging
- **Validation**: Zod runtime type validation
- **Testing**: Jest with Supertest and fast-check
- **Documentation**: Swagger/OpenAPI 3.0

### Security & Middleware
- **Helmet** - Security headers
- **CORS** - Cross-origin resource sharing
- **Rate limiting** - Express rate limit
- **Input sanitization** - XSS and SQL injection prevention
- **Request validation** - Zod schema validation

## 📋 Prerequisites

- **Node.js** 18.0.0 or higher
- **MySQL** 8.0 or higher
- **npm** (latest stable version)

## 🚀 Quick Start

### 1. Installation

```bash
# Clone the repository
git clone <repository-url>
cd multi-tenant-saas-backend

# Install dependencies
npm install
```

### 2. Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### 3. Database Setup

```bash
# Create databases (adjust credentials as needed)
mysql -u root -p -e "CREATE DATABASE Administration;"
mysql -u root -p -e "CREATE DATABASE Administration_test;"

# Run database migrations
npm run db:migrate

# (Optional) Seed initial data
npm run db:seed
```

### 4. Start Development Server

```bash
# Start with hot reload
npm run dev

# Server will start at http://localhost:3000
```

## 🔧 Environment Variables

Configure these variables in your `.env` file:

### Database Configuration
```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=Administration
DB_USER=root
DB_PASSWORD=your_password
DB_CONNECTION_LIMIT=10
```

### JWT Configuration
```env
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_SECRET=your-super-secret-refresh-token-key-minimum-32-characters
REFRESH_TOKEN_EXPIRES_IN=7d
```

### Email Configuration
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
FROM_EMAIL=noreply@yourapp.com
FROM_NAME=Your App Name
```

### Security Configuration
```env
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=5
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
MAX_REQUEST_SIZE=10mb
```

## 📚 API Documentation

### Access Swagger UI
Once your server is running, access the interactive API documentation:

- **Swagger UI**: http://localhost:3000/docs
- **Raw OpenAPI JSON**: http://localhost:3000/docs.json

### Key Endpoints

#### System Health
- `GET /health` - Comprehensive health check with database, email, and memory status
- `GET /health/live` - Kubernetes liveness probe
- `GET /health/ready` - Kubernetes readiness probe

#### Authentication
- `POST /auth/login` - User authentication
- `POST /auth/refresh` - Refresh access tokens
- `POST /auth/logout` - User logout
- `POST /auth/register` - User registration

#### User Management
- `GET /users/profile` - Get current user profile
- `PUT /users/profile` - Update user profile
- `POST /users/change-password` - Change password

#### Organization Management
- `POST /organizations` - Create new organization
- `GET /organizations` - List user's organizations
- `GET /organizations/:id` - Get organization details
- `PUT /organizations/:id` - Update organization
- `POST /organizations/:id/invite` - Invite users to organization

#### Team Management
- `POST /organizations/:orgId/teams` - Create team
- `GET /organizations/:orgId/teams` - List organization teams
- `POST /organizations/:orgId/teams/:teamId/members` - Add team member

#### Audit & Compliance
- `GET /audit/logs` - Get audit logs (admin only)
- `GET /audit/user/:userId` - Get user-specific audit trail

## 🏗 Architecture Overview

### Directory Structure
```
src/
├── app.ts                    # Express app configuration
├── index.ts                  # Application entry point
├── config/                   # Configuration modules
│   ├── database.ts          # Database connection
│   ├── env.ts              # Environment validation
│   ├── logger.ts           # Logging configuration
│   └── swagger.ts          # API documentation
├── middleware/              # Express middleware
│   ├── auth.middleware.ts   # JWT authentication
│   ├── tenant.middleware.ts # Multi-tenant context
│   ├── audit.middleware.ts  # Audit logging
│   └── security.middleware.ts # Security headers
├── routes/                  # API route definitions
├── services/                # Business logic services
├── database/               # Database migrations & seeds
└── types/                  # TypeScript type definitions
```

### Multi-Tenant Design
- **Organization-based tenancy** with `organization_id` scoping
- **Row-level security** enforced through middleware
- **Tenant-aware queries** with automatic context injection
- **Isolated data access** per organization

## 🧪 Development Commands

### Development Server
```bash
npm run dev          # Start with hot reload
npm run build        # Compile TypeScript
npm start           # Start production server
```

### Testing
```bash
npm test            # Run all tests
npm run test:unit   # Unit tests only
npm run test:integration # Integration tests only
npm run test:watch  # Watch mode
```

### Code Quality
```bash
npm run lint        # Check linting issues
npm run lint:fix    # Fix linting issues
npm run format      # Format with Prettier
npm run format:check # Check formatting
```

### Database Operations
```bash
npm run db:migrate  # Run pending migrations
npm run db:rollback # Rollback last migration
npm run db:seed     # Run database seeds
```

## 🔒 Security Features

### Authentication & Authorization
- **JWT tokens** with configurable expiration
- **Refresh token rotation** for enhanced security
- **bcrypt password hashing** with configurable rounds
- **Role-based permissions** with fine-grained control

### Security Middleware
- **Rate limiting** on sensitive endpoints
- **Input sanitization** against XSS attacks
- **SQL injection prevention** with parameterized queries
- **CORS configuration** with allowed origins
- **Security headers** via Helmet
- **Request size limiting** to prevent DoS

### Audit & Compliance
- **Comprehensive audit logging** for all operations
- **User activity tracking** with IP and user agent
- **Data access logging** for compliance requirements
- **Configurable retention policies**

## 🚀 Production Deployment

### Build for Production
```bash
# Install production dependencies
npm ci --only=production

# Build the application
npm run build

# Run database migrations
NODE_ENV=production npm run db:migrate
```

### Environment Setup
1. Set `NODE_ENV=production`
2. Configure production database credentials
3. Set strong JWT secrets (minimum 32 characters)
4. Configure SMTP for email functionality
5. Set appropriate CORS origins
6. Configure rate limiting for your traffic

### Health Checks
The application provides Kubernetes/Docker-ready health endpoints:
- `/health/live` - Liveness probe
- `/health/ready` - Readiness probe
- `/health` - Detailed health status

### Monitoring
- **Structured JSON logging** with Pino
- **Performance monitoring** with request timing
- **Memory usage tracking** in health checks
- **Database connection monitoring**

## 🧪 Testing

### Test Structure
- **Unit tests** - Individual component testing
- **Integration tests** - API endpoint testing
- **Property-based testing** - With fast-check for edge cases

### Running Tests
```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Watch mode for development
npm run test:watch
```

## 📝 Contributing

1. Follow the existing code style (ESLint + Prettier)
2. Write tests for new features
3. Update documentation for API changes
4. Ensure all tests pass before submitting

## 📄 License

MIT License - see LICENSE file for details

---

## 🆘 Troubleshooting

### Common Issues

**Database Connection Issues**
- Verify MySQL is running and accessible
- Check database credentials in `.env`
- Ensure database exists and user has proper permissions

**JWT Token Issues**
- Ensure JWT secrets are at least 32 characters
- Check token expiration settings
- Verify refresh token rotation is working

**Email Not Working**
- Verify SMTP credentials and settings
- Check if less secure apps are enabled (Gmail)
- Test email configuration with a simple send

**Performance Issues**
- Monitor the `/health` endpoint for system status
- Check database connection pool settings
- Review logs for slow query warnings

For more help, check the logs at the configured log level or enable debug logging by setting `LOG_LEVEL=debug` in your environment.