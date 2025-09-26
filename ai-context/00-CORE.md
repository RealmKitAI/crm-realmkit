# CRM Core Architecture

This module provides the foundational patterns for the CRM RealmKit, covering core architecture, database models, authentication, and shared utilities.

## Architecture Overview

The CRM follows a **relationship-centric architecture** where all data and interactions revolve around customer relationships and business outcomes.

### Core Principles

1. **Relationship First**: Every action should strengthen customer relationships
2. **Data Integrity**: Maintain accurate, deduplicated customer data
3. **Activity Tracking**: Capture all customer interactions
4. **Pipeline Driven**: Guide prospects through defined sales stages
5. **Automation Ready**: Design for workflow automation

### System Architecture

```typescript
// Core domain models
interface CRMEntity {
  id: string
  createdAt: Date
  updatedAt: Date
  createdBy: string
  updatedBy?: string
}

// Contact hierarchy
Contact → Company → Industry
Person → Contact → Activities → Deals
```

## Database Schema Core

```prisma
// User management
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  role      UserRole @default(SALES_REP)
  isActive  Boolean  @default(true)
  
  // CRM relationships
  contacts     Contact[]
  companies    Company[]
  deals        Deal[]
  activities   Activity[]
  tasks        Task[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@map("users")
}

// Core contact entity
model Contact {
  id          String      @id @default(cuid())
  type        ContactType @default(PERSON)
  firstName   String?
  lastName    String?
  companyName String?     // For company contacts
  email       String?
  phone       String?
  title       String?
  source      String?     // Lead source
  status      ContactStatus @default(LEAD)
  
  // Relationships
  companyId   String?
  company     Company?    @relation(fields: [companyId], references: [id])
  ownerId     String      // Assigned user
  owner       User        @relation(fields: [ownerId], references: [id])
  
  // Related entities
  deals       Deal[]
  activities  Activity[]
  tasks       Task[]
  notes       Note[]
  
  // Metadata
  tags        String[]
  customFields Json?
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@map("contacts")
}

model Company {
  id          String  @id @default(cuid())
  name        String
  website     String?
  industry    String?
  size        String?
  revenue     Decimal? @db.Decimal(12, 2)
  description String?
  
  // Address
  address     String?
  city        String?
  state       String?
  country     String?
  postalCode  String?
  
  // Relationships
  contacts    Contact[]
  deals       Deal[]
  ownerId     String
  owner       User     @relation(fields: [ownerId], references: [id])
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@map("companies")
}

// Enums
enum UserRole {
  ADMIN
  SALES_MANAGER
  SALES_REP
  MARKETING
  SUPPORT
}

enum ContactType {
  PERSON
  COMPANY
}

enum ContactStatus {
  LEAD
  PROSPECT
  QUALIFIED
  CUSTOMER
  INACTIVE
  UNQUALIFIED
}
```

## Service Layer Architecture

```typescript
// Base service class
abstract class BaseService<T> {
  constructor(protected db: PrismaClient) {}
  
  async findById(id: string): Promise<T | null> {
    return this.db[this.tableName].findUnique({
      where: { id }
    })
  }
  
  async create(data: CreateData<T>): Promise<T> {
    return this.db[this.tableName].create({
      data: {
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    })
  }
  
  async update(id: string, data: UpdateData<T>): Promise<T> {
    return this.db[this.tableName].update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date()
      }
    })
  }
  
  async delete(id: string): Promise<T> {
    return this.db[this.tableName].delete({
      where: { id }
    })
  }
  
  protected abstract get tableName(): string
}

// Contact service implementation
class ContactService extends BaseService<Contact> {
  protected get tableName() { return 'contact' }
  
  async findByEmail(email: string): Promise<Contact | null> {
    return this.db.contact.findUnique({
      where: { email },
      include: {
        company: true,
        owner: true,
        deals: true,
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    })
  }
  
  async searchContacts(
    query: string,
    filters: ContactFilters = {}
  ): Promise<Contact[]> {
    const where: Prisma.ContactWhereInput = {
      AND: [
        // Text search
        query ? {
          OR: [
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
            { companyName: { contains: query, mode: 'insensitive' } }
          ]
        } : {},
        // Filters
        filters.status ? { status: filters.status } : {},
        filters.ownerId ? { ownerId: filters.ownerId } : {},
        filters.companyId ? { companyId: filters.companyId } : {}
      ]
    }
    
    return this.db.contact.findMany({
      where,
      include: {
        company: true,
        owner: { select: { id: true, name: true, email: true } }
      },
      orderBy: { updatedAt: 'desc' }
    })
  }
  
  async duplicateCheck(contact: Partial<Contact>): Promise<Contact[]> {
    const conditions = []
    
    if (contact.email) {
      conditions.push({ email: contact.email })
    }
    
    if (contact.firstName && contact.lastName) {
      conditions.push({
        AND: [
          { firstName: { equals: contact.firstName, mode: 'insensitive' } },
          { lastName: { equals: contact.lastName, mode: 'insensitive' } }
        ]
      })
    }
    
    if (conditions.length === 0) return []
    
    return this.db.contact.findMany({
      where: { OR: conditions },
      include: { company: true }
    })
  }
}
```

## API Route Patterns

```typescript
// /api/contacts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { ContactService } from '@/lib/services/contact-service'
import { ContactCreateSchema, ContactFiltersSchema } from '@/lib/validations/contact'
import { withAuth } from '@/lib/auth/middleware'

export async function GET(request: NextRequest) {
  return withAuth(async (session) => {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    
    // Validate filters
    const filtersResult = ContactFiltersSchema.safeParse({
      status: searchParams.get('status'),
      ownerId: searchParams.get('ownerId'),
      companyId: searchParams.get('companyId')
    })
    
    if (!filtersResult.success) {
      return NextResponse.json(
        { error: 'Invalid filters' },
        { status: 400 }
      )
    }
    
    const contactService = new ContactService(db)
    const contacts = await contactService.searchContacts(query, filtersResult.data)
    
    return NextResponse.json(contacts)
  })
}

export async function POST(request: NextRequest) {
  return withAuth(async (session) => {
    const body = await request.json()
    
    // Validate input
    const result = ContactCreateSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.errors },
        { status: 400 }
      )
    }
    
    const contactService = new ContactService(db)
    
    // Check for duplicates
    const duplicates = await contactService.duplicateCheck(result.data)
    if (duplicates.length > 0) {
      return NextResponse.json(
        { 
          error: 'Potential duplicate found',
          duplicates: duplicates.map(d => ({
            id: d.id,
            name: `${d.firstName} ${d.lastName}`,
            email: d.email,
            company: d.company?.name
          }))
        },
        { status: 409 }
      )
    }
    
    // Create contact
    const contact = await contactService.create({
      ...result.data,
      ownerId: session.user.id
    })
    
    return NextResponse.json(contact, { status: 201 })
  })
}
```

## Validation Schemas

```typescript
import { z } from 'zod'

export const ContactCreateSchema = z.object({
  type: z.enum(['PERSON', 'COMPANY']).default('PERSON'),
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  companyName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  title: z.string().max(100).optional(),
  source: z.string().max(50).optional(),
  companyId: z.string().cuid().optional(),
  tags: z.array(z.string()).default([]),
  customFields: z.record(z.any()).optional()
}).refine(data => {
  // Business rules validation
  if (data.type === 'PERSON') {
    return data.firstName || data.lastName
  }
  return data.companyName
}, {
  message: "Person contacts need firstName or lastName, company contacts need companyName"
})

export const ContactUpdateSchema = ContactCreateSchema.partial()

export const ContactFiltersSchema = z.object({
  status: z.enum(['LEAD', 'PROSPECT', 'QUALIFIED', 'CUSTOMER', 'INACTIVE', 'UNQUALIFIED']).optional(),
  ownerId: z.string().cuid().optional(),
  companyId: z.string().cuid().optional(),
  tags: z.array(z.string()).optional()
})

export type ContactCreateInput = z.infer<typeof ContactCreateSchema>
export type ContactUpdateInput = z.infer<typeof ContactUpdateSchema>
export type ContactFilters = z.infer<typeof ContactFiltersSchema>
```

## Authentication & Authorization

```typescript
// Auth middleware for CRM routes
export function withAuth<T extends any[]>(
  handler: (session: Session, ...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    return handler(session, ...args)
  }
}

// Role-based access control
export function requireRole(allowedRoles: UserRole[]) {
  return function withRoleCheck<T extends any[]>(
    handler: (session: Session, ...args: T) => Promise<NextResponse>
  ) {
    return withAuth(async (session: Session, ...args: T) => {
      const user = await db.user.findUnique({
        where: { email: session.user.email },
        select: { role: true, isActive: true }
      })
      
      if (!user?.isActive) {
        return NextResponse.json(
          { error: 'Account deactivated' },
          { status: 403 }
        )
      }
      
      if (!allowedRoles.includes(user.role)) {
        return NextResponse.json(
          { error: 'Insufficient permissions' },
          { status: 403 }
        )
      }
      
      return handler(session, ...args)
    })
  }
}

// Usage in routes
export const DELETE = requireRole(['ADMIN', 'SALES_MANAGER'])(
  async (session, request, { params }) => {
    // Only admins and managers can delete contacts
    const contactService = new ContactService(db)
    await contactService.delete(params.id)
    return NextResponse.json({ success: true })
  }
)
```

## Error Handling

```typescript
// Custom error classes
export class CRMError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message)
    this.name = 'CRMError'
  }
}

export class ValidationError extends CRMError {
  constructor(message: string, public details?: any) {
    super(message, 'VALIDATION_ERROR', 400)
    this.details = details
  }
}

export class DuplicateError extends CRMError {
  constructor(message: string, public duplicates?: any[]) {
    super(message, 'DUPLICATE_ERROR', 409)
    this.duplicates = duplicates
  }
}

export class NotFoundError extends CRMError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404)
  }
}

// Error handler middleware
export function handleServiceError(error: unknown): NextResponse {
  if (error instanceof CRMError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        ...(error.details && { details: error.details }),
        ...(error.duplicates && { duplicates: error.duplicates })
      },
      { status: error.statusCode }
    )
  }
  
  console.error('Unexpected error:', error)
  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  )
}
```

## Testing Patterns

```typescript
// Test utilities
export const createMockContact = (overrides?: Partial<Contact>): Contact => ({
  id: 'cuid-test-123',
  type: 'PERSON',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  phone: '+1234567890',
  status: 'LEAD',
  ownerId: 'user-123',
  companyId: null,
  tags: [],
  customFields: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
})

// Service tests
describe('ContactService', () => {
  let service: ContactService
  let mockDb: DeepMockProxy<PrismaClient>
  
  beforeEach(() => {
    mockDb = mockDeep<PrismaClient>()
    service = new ContactService(mockDb)
  })
  
  describe('duplicateCheck', () => {
    it('should find duplicates by email', async () => {
      const contact = createMockContact({ email: 'test@example.com' })
      mockDb.contact.findMany.mockResolvedValue([contact])
      
      const duplicates = await service.duplicateCheck({
        email: 'test@example.com'
      })
      
      expect(duplicates).toHaveLength(1)
      expect(mockDb.contact.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ email: 'test@example.com' }]
        },
        include: { company: true }
      })
    })
  })
})

// API route tests
describe('/api/contacts', () => {
  it('should create contact with valid data', async () => {
    const contactData = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      type: 'PERSON'
    }
    
    const response = await POST(
      new Request('http://localhost:3000/api/contacts', {
        method: 'POST',
        body: JSON.stringify(contactData),
        headers: { 'Content-Type': 'application/json' }
      })
    )
    
    expect(response.status).toBe(201)
    const result = await response.json()
    expect(result.firstName).toBe('John')
  })
})
```

This core module establishes the foundational patterns for CRM development, focusing on relationship management, data integrity, and scalable architecture.