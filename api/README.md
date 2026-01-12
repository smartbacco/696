# Kubacco API Server

RESTful API backend for the Kubacco Warehouse Management System.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and add your database credentials:

```env
PORT=3001
NODE_ENV=development

JWT_SECRET=your_secure_random_string
JWT_EXPIRES_IN=7d

CORS_ORIGIN=http://localhost:5173

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**Important**: Get your service role key from Supabase Dashboard → Settings → API

### 3. Start Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:3001`

### 4. Test the API

```bash
# Health check
curl http://localhost:3001/health

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin_user@696group.com","password":"admin123"}'
```

## Project Structure

```
api/
├── src/
│   ├── config/
│   │   └── database.ts       # Database connection
│   ├── middleware/
│   │   ├── auth.ts           # Authentication middleware
│   │   └── errorHandler.ts  # Error handling
│   ├── routes/
│   │   ├── auth.routes.ts    # Authentication endpoints
│   │   ├── users.routes.ts   # User management
│   │   ├── orders.routes.ts  # Order management
│   │   ├── dashboard.routes.ts # Dashboard stats
│   │   ├── products.routes.ts  # Product management
│   │   ├── inventory.routes.ts # Inventory management
│   │   └── shipping.routes.ts  # Shipping management
│   ├── types/
│   │   └── index.ts          # TypeScript types
│   └── index.ts              # Main application
├── package.json
├── tsconfig.json
└── .env
```

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server

## Authentication

All protected endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

Get a token by calling `/api/auth/login` with valid credentials.

## Role-Based Access

Three roles are supported:
- **ADMIN** - Full access to all resources
- **MANAGEMENT** - Create/read/update access to most resources
- **SHIPPER** - Read-only access to orders and shipping

## API Documentation

See [API_MIGRATION_GUIDE.md](../API_MIGRATION_GUIDE.md) for complete endpoint documentation.

## Database Configuration

### Using Supabase

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`.

### Using External PostgreSQL

Update `src/config/database.ts` to use a PostgreSQL client:

```typescript
import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
```

Then replace Supabase client calls with PostgreSQL queries.

## Error Handling

All errors are returned in this format:

```json
{
  "success": false,
  "error": "Error message"
}
```

HTTP status codes:
- 200 - Success
- 201 - Created
- 400 - Bad request
- 401 - Unauthorized
- 403 - Forbidden
- 404 - Not found
- 500 - Server error

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| PORT | Server port | No (default: 3001) |
| NODE_ENV | Environment | No (default: development) |
| JWT_SECRET | JWT signing secret | Yes |
| JWT_EXPIRES_IN | Token expiration | No (default: 7d) |
| CORS_ORIGIN | Allowed CORS origin | Yes |
| SUPABASE_URL | Supabase project URL | Yes |
| SUPABASE_SERVICE_ROLE_KEY | Supabase service key | Yes |

## Deployment

### Heroku

```bash
heroku create kubacco-api
heroku config:set JWT_SECRET=your_secret
heroku config:set SUPABASE_URL=your_url
heroku config:set SUPABASE_SERVICE_ROLE_KEY=your_key
git push heroku main
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

## Testing

Test login:

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin_user@696group.com",
    "password": "admin123"
  }'
```

Test protected endpoint:

```bash
curl http://localhost:3001/api/orders \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Support

For issues or questions, refer to the main [API Migration Guide](../API_MIGRATION_GUIDE.md).
