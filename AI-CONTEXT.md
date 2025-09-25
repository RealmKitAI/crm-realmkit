# AI-CONTEXT: RealmKit CRM Development Guide

## Overview for AI Assistants

This document provides comprehensive context for AI coding assistants working on the RealmKit CRM. Every pattern, convention, and architectural decision is documented here to enable optimal AI-assisted development.

## Project Structure & Navigation

### Quick Reference Map
```
crm-realmkit/                    # Root directory
├── 📱 app/                      # Next.js 14 App Router
│   ├── (auth)/                  # Auth pages: login, register
│   ├── (dashboard)/             # Main CRM interface
│   │   ├── contacts/            # Contact management
│   │   ├── leads/               # Lead management
│   │   ├── deals/               # Sales pipeline
│   │   ├── activities/          # Activity tracking
│   │   ├── analytics/           # Reports & dashboards
│   │   └── settings/            # CRM configuration
│   └── api/                     # API endpoints
│       ├── contacts/            # Contact CRUD
│       ├── leads/               # Lead operations
│       ├── deals/               # Deal management
│       ├── activities/          # Activity tracking
│       ├── analytics/           # Reporting APIs
│       └── integrations/        # Third-party APIs
├── 🧩 components/               # React components
│   ├── ui/                      # shadcn/ui base components
│   ├── crm/                     # CRM-specific components
│   │   ├── contacts/            # Contact UI components
│   │   ├── leads/               # Lead UI components
│   │   ├── deals/               # Deal/pipeline components
│   │   ├── activities/          # Activity components
│   │   └── analytics/           # Chart/report components
│   └── forms/                   # Form components
├── 🔧 lib/                      # Core utilities
│   ├── auth.ts                  # NextAuth configuration
│   ├── db.ts                    # Prisma client
│   └── utils.ts                 # Helper functions
├── 🔐 services/                 # Business logic layer
│   ├── contact.service.ts       # Contact operations
│   ├── lead.service.ts          # Lead management
│   ├── deal.service.ts          # Deal operations
│   └── analytics.service.ts     # Analytics logic
└── 🗄️ prisma/                   # Database layer
    ├── schema.prisma            # Database schema
    └── seed.ts                  # Sample data
```

### Key Files AI Should Know

**Configuration Files:**
- `package.json` - Dependencies and scripts
- `next.config.js` - Next.js configuration
- `tailwind.config.js` - Styling configuration
- `prisma/schema.prisma` - Database schema
- `.env.example` - Environment variables template

**Core Utilities:**
- `lib/auth.ts` - Authentication setup
- `lib/db.ts` - Database client
- `lib/utils.ts` - Shared utilities

**Types & Schemas:**
- Look in each feature directory for `types.ts` files
- Prisma generates types in `node_modules/.prisma/client`

## Development Patterns & Conventions

### 1. File Naming Conventions

```typescript
// Components: PascalCase
ContactList.tsx
DealPipeline.tsx
ActivityTimeline.tsx

// Pages: kebab-case
contact-details/page.tsx
deal-pipeline/page.tsx

// API Routes: kebab-case
api/contacts/route.ts
api/deals/[id]/route.ts

// Services: camelCase.service.ts
contact.service.ts
analytics.service.ts

// Utils: camelCase.ts
validation.ts
date-helpers.ts

// Types: camelCase.types.ts
contact.types.ts
api.types.ts
```

### 2. Component Architecture

**Standard Component Structure:**
```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ContactService } from '@/services/contact.service'
import type { Contact } from '@prisma/client'

interface ContactListProps {
  initialContacts: Contact[]
  onContactSelect: (contact: Contact) => void
}

export function ContactList({ 
  initialContacts, 
  onContactSelect 
}: ContactListProps) {
  const [contacts, setContacts] = useState(initialContacts)
  
  // Component logic here
  
  return (
    <div className="space-y-4">
      {/* Component JSX */}
    </div>
  )
}
```

**Component Guidelines:**
- Always define props interface
- Use TypeScript strict mode
- Implement proper error boundaries
- Follow shadcn/ui patterns
- Use Tailwind classes consistently

### 3. API Route Patterns

**Standard API Route Structure:**
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { ContactService } from '@/services/contact.service'
import { authOptions } from '@/lib/auth'

// Request validation schema
const CreateContactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  company: z.string().optional()
})

export async function POST(request: NextRequest) {
  try {
    // 1. Authentication check
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Request validation
    const body = await request.json()
    const validatedData = CreateContactSchema.parse(body)

    // 3. Business logic
    const contact = await ContactService.create({
      ...validatedData,
      userId: session.user.id
    })

    // 4. Response
    return NextResponse.json(contact, { status: 201 })
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors }, 
        { status: 400 }
      )
    }
    
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  // Similar pattern for GET requests
}
```

### 4. Service Layer Patterns

**Service Implementation Pattern:**
```typescript
import { prisma } from '@/lib/db'
import type { Contact, Prisma } from '@prisma/client'

export class ContactService {
  static async create(data: Prisma.ContactCreateInput): Promise<Contact> {
    return prisma.contact.create({
      data,
      include: {
        company: true,
        activities: {
          take: 5,
          orderBy: { createdAt: 'desc' }
        }
      }
    })
  }

  static async findMany(
    filters: ContactFilters,
    pagination: PaginationInput
  ): Promise<ContactListResult> {
    const { page = 1, limit = 20, search, companyId } = filters
    const skip = (page - 1) * limit

    const where: Prisma.ContactWhereInput = {
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ]
      }),
      ...(companyId && { companyId })
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        skip,
        take: limit,
        include: {
          company: true,
          _count: {
            select: { activities: true, deals: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.contact.count({ where })
    ])

    return {
      contacts,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    }
  }

  // More service methods...
}
```

### 5. Database Query Patterns

**Optimized Query Examples:**
```typescript
// Include related data efficiently
const contactsWithDetails = await prisma.contact.findMany({
  include: {
    company: {
      select: { id: true, name: true, industry: true }
    },
    activities: {
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { id: true, type: true, subject: true, createdAt: true }
    },
    _count: {
      select: { deals: true, tasks: true }
    }
  }
})

// Complex filtering with search
const searchContacts = await prisma.contact.findMany({
  where: {
    AND: [
      {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
          { company: { name: { contains: query, mode: 'insensitive' } } }
        ]
      },
      status === 'active' ? { deletedAt: null } : {}
    ]
  }
})

// Aggregation queries
const dealMetrics = await prisma.deal.aggregate({
  where: { userId },
  _sum: { value: true },
  _count: { id: true },
  _avg: { value: true }
})
```

### 6. Type Safety Patterns

**Comprehensive TypeScript Usage:**
```typescript
// API Response types
export interface ApiResponse<T = any> {
  data?: T
  error?: string
  message?: string
}

// Service method signatures
export interface ContactService {
  create(data: CreateContactInput): Promise<Contact>
  update(id: string, data: UpdateContactInput): Promise<Contact>
  findById(id: string): Promise<Contact | null>
  findMany(filters: ContactFilters): Promise<ContactListResult>
  delete(id: string): Promise<void>
}

// Form validation schemas
export const ContactFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').optional(),
  phone: z.string().optional(),
  companyId: z.string().uuid().optional(),
  customFields: z.record(z.any()).optional()
})

export type ContactFormData = z.infer<typeof ContactFormSchema>

// Component prop interfaces
export interface ContactCardProps {
  contact: Contact & {
    company: Company | null
    _count: { activities: number; deals: number }
  }
  onEdit: (contact: Contact) => void
  onDelete: (contactId: string) => void
  className?: string
}
```

## CRM-Specific Patterns

### 1. Contact Management

**Contact Entity Structure:**
```typescript
// Key contact fields
interface Contact {
  id: string
  name: string
  email?: string
  phone?: string
  companyId?: string
  customFields: Record<string, any>
  tags: string[]
  status: ContactStatus
  createdAt: Date
  updatedAt: Date
}

// Contact relationships
const contactWithRelations = await prisma.contact.findUnique({
  where: { id },
  include: {
    company: true,
    activities: { orderBy: { createdAt: 'desc' } },
    deals: { where: { status: { not: 'LOST' } } },
    tasks: { where: { completed: false } }
  }
})
```

### 2. Lead Scoring System

**AI-Powered Lead Scoring:**
```typescript
export class LeadScoringService {
  static async calculateScore(leadId: string): Promise<number> {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        activities: true,
        company: true
      }
    })

    if (!lead) return 0

    let score = 0

    // Engagement scoring
    score += lead.activities.length * 5
    score += lead.emailOpened ? 10 : 0
    score += lead.websiteVisits * 2

    // Demographic scoring
    if (lead.company?.industry === 'TECHNOLOGY') score += 15
    if (lead.company?.size === 'ENTERPRISE') score += 20

    // Behavioral scoring
    const recentActivity = lead.activities.filter(
      a => a.createdAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    )
    score += recentActivity.length * 3

    return Math.min(score, 100) // Cap at 100
  }
}
```

### 3. Sales Pipeline Management

**Pipeline Stage Management:**
```typescript
export const DEAL_STAGES = {
  PROSPECT: { name: 'Prospect', probability: 0.1, color: 'gray' },
  QUALIFIED: { name: 'Qualified', probability: 0.25, color: 'blue' },
  PROPOSAL: { name: 'Proposal', probability: 0.5, color: 'yellow' },
  NEGOTIATION: { name: 'Negotiation', probability: 0.75, color: 'orange' },
  WON: { name: 'Won', probability: 1.0, color: 'green' },
  LOST: { name: 'Lost', probability: 0.0, color: 'red' }
} as const

export type DealStage = keyof typeof DEAL_STAGES

// Pipeline calculations
export class PipelineService {
  static async getForecast(userId: string, timeframe: 'month' | 'quarter') {
    const deals = await prisma.deal.findMany({
      where: {
        userId,
        status: { not: 'LOST' },
        expectedCloseDate: {
          gte: new Date(),
          lte: addMonths(new Date(), timeframe === 'month' ? 1 : 3)
        }
      }
    })

    const forecast = deals.reduce((acc, deal) => {
      const probability = DEAL_STAGES[deal.stage].probability
      return acc + (deal.value * probability)
    }, 0)

    return { forecast, totalValue: deals.reduce((acc, deal) => acc + deal.value, 0) }
  }
}
```

### 4. Activity Timeline

**Activity Tracking Pattern:**
```typescript
export class ActivityService {
  static async createActivity(data: CreateActivityInput): Promise<Activity> {
    return prisma.activity.create({
      data: {
        ...data,
        createdAt: new Date()
      }
    })
  }

  static async getTimeline(
    entityType: 'CONTACT' | 'DEAL' | 'COMPANY',
    entityId: string
  ) {
    return prisma.activity.findMany({
      where: { entityType, entityId },
      include: {
        user: { select: { name: true, image: true } },
        attachments: true
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  // Auto-activity creation
  static async trackDealStageChange(dealId: string, fromStage: string, toStage: string) {
    await this.createActivity({
      type: 'DEAL_STAGE_CHANGE',
      entityType: 'DEAL',
      entityId: dealId,
      subject: `Deal moved from ${fromStage} to ${toStage}`,
      metadata: { fromStage, toStage }
    })
  }
}
```

## UI Component Patterns

### 1. Data Tables

**Using TanStack Table:**
```typescript
import { useReactTable, getCoreRowModel, ColumnDef } from '@tanstack/react-table'

const columns: ColumnDef<Contact>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <div className="flex items-center space-x-2">
        <Avatar>
          <AvatarFallback>{row.original.name.charAt(0)}</AvatarFallback>
        </Avatar>
        <span>{row.original.name}</span>
      </div>
    )
  },
  {
    accessorKey: 'email',
    header: 'Email'
  },
  {
    accessorKey: 'company.name',
    header: 'Company'
  }
]

export function ContactsTable({ data }: { data: Contact[] }) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel()
  })

  return (
    <Table>
      {/* Table implementation */}
    </Table>
  )
}
```

### 2. Pipeline Kanban

**Using Beautiful DND:**
```typescript
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'

export function DealPipeline({ deals, onDealMove }: PipelineProps) {
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return

    const { source, destination, draggableId } = result
    
    if (source.droppableId !== destination.droppableId) {
      onDealMove(draggableId, destination.droppableId as DealStage)
    }
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex space-x-4 overflow-x-auto">
        {Object.entries(DEAL_STAGES).map(([stage, config]) => (
          <Droppable key={stage} droppableId={stage}>
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="bg-gray-100 p-4 rounded-lg min-w-80"
              >
                <h3 className="font-semibold mb-4">{config.name}</h3>
                {deals.filter(deal => deal.stage === stage).map((deal, index) => (
                  <Draggable key={deal.id} draggableId={deal.id} index={index}>
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                      >
                        <DealCard deal={deal} />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        ))}
      </div>
    </DragDropContext>
  )
}
```

### 3. Calendar Integration

**Using React Big Calendar:**
```typescript
import { Calendar, momentLocalizer } from 'react-big-calendar'
import moment from 'moment'

const localizer = momentLocalizer(moment)

export function ActivityCalendar({ activities }: { activities: Activity[] }) {
  const events = activities.map(activity => ({
    id: activity.id,
    title: activity.subject,
    start: new Date(activity.scheduledAt || activity.createdAt),
    end: new Date(activity.scheduledAt || activity.createdAt),
    resource: activity
  }))

  return (
    <Calendar
      localizer={localizer}
      events={events}
      startAccessor="start"
      endAccessor="end"
      style={{ height: 600 }}
      onSelectEvent={(event) => {
        // Handle event selection
      }}
    />
  )
}
```

## State Management Patterns

### 1. Zustand Store Structure

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface CRMStore {
  // State
  selectedContact: Contact | null
  filters: ContactFilters
  viewMode: 'list' | 'grid' | 'kanban'
  
  // Actions
  setSelectedContact: (contact: Contact | null) => void
  updateFilters: (filters: Partial<ContactFilters>) => void
  setViewMode: (mode: 'list' | 'grid' | 'kanban') => void
}

export const useCRMStore = create<CRMStore>()(
  persist(
    (set) => ({
      selectedContact: null,
      filters: {},
      viewMode: 'list',
      
      setSelectedContact: (contact) => set({ selectedContact: contact }),
      updateFilters: (newFilters) => 
        set((state) => ({ filters: { ...state.filters, ...newFilters } })),
      setViewMode: (mode) => set({ viewMode: mode })
    }),
    {
      name: 'crm-store'
    }
  )
)
```

### 2. TanStack Query Patterns

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// Query hooks
export function useContacts(filters: ContactFilters) {
  return useQuery({
    queryKey: ['contacts', filters],
    queryFn: () => ContactService.findMany(filters),
    staleTime: 5 * 60 * 1000 // 5 minutes
  })
}

export function useContact(id: string) {
  return useQuery({
    queryKey: ['contact', id],
    queryFn: () => ContactService.findById(id),
    enabled: !!id
  })
}

// Mutation hooks
export function useCreateContact() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ContactService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    }
  })
}

export function useUpdateContact() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateContactInput }) =>
      ContactService.update(id, data),
    onSuccess: (contact) => {
      queryClient.setQueryData(['contact', contact.id], contact)
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    }
  })
}
```

## Testing Patterns

### 1. Unit Test Structure

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ContactService } from '@/services/contact.service'
import { prismaMock } from '../__mocks__/prisma'

vi.mock('@/lib/db', () => ({
  prisma: prismaMock
}))

describe('ContactService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('should create a contact with valid data', async () => {
      const contactData = {
        name: 'John Doe',
        email: 'john@example.com',
        userId: 'user-1'
      }

      const expectedContact = {
        id: 'contact-1',
        ...contactData,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      prismaMock.contact.create.mockResolvedValue(expectedContact)

      const result = await ContactService.create(contactData)

      expect(result).toEqual(expectedContact)
      expect(prismaMock.contact.create).toHaveBeenCalledWith({
        data: contactData,
        include: expect.any(Object)
      })
    })
  })
})
```

### 2. Integration Test Pattern

```typescript
import { describe, it, expect } from 'vitest'
import { testApiHandler } from 'next-test-api-route-handler'
import handler from '@/app/api/contacts/route'

describe('/api/contacts', () => {
  it('should create a new contact', async () => {
    await testApiHandler({
      handler,
      test: async ({ fetch }) => {
        const response = await fetch({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: 'Test Contact',
            email: 'test@example.com'
          })
        })

        expect(response.status).toBe(201)
        
        const contact = await response.json()
        expect(contact.name).toBe('Test Contact')
        expect(contact.email).toBe('test@example.com')
      }
    })
  })
})
```

### 3. E2E Test Structure

```typescript
import { test, expect } from '@playwright/test'

test.describe('Contact Management', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: login user
    await page.goto('/login')
    await page.fill('[data-testid="email"]', 'test@example.com')
    await page.fill('[data-testid="password"]', 'password123')
    await page.click('[data-testid="login-button"]')
    await page.waitForURL('/dashboard')
  })

  test('should create a new contact', async ({ page }) => {
    await page.goto('/dashboard/contacts')
    await page.click('[data-testid="create-contact-button"]')
    
    await page.fill('[data-testid="contact-name"]', 'John Doe')
    await page.fill('[data-testid="contact-email"]', 'john@example.com')
    await page.click('[data-testid="save-contact-button"]')
    
    await expect(page.locator('[data-testid="contact-list"]')).toContainText('John Doe')
  })
})
```

## Common Issues & Solutions

### 1. Database Connection Issues

```typescript
// Proper Prisma client initialization
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

### 2. NextAuth Configuration

```typescript
// Complete NextAuth setup
import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prisma } from '@/lib/db'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        })

        if (!user || !user.password) {
          return null
        }

        const isValid = await bcrypt.compare(credentials.password, user.password)

        if (!isValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name
        }
      }
    })
  ],
  session: {
    strategy: 'jwt'
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
      }
      return session
    }
  }
}
```

### 3. Type-Safe API Responses

```typescript
// Utility for type-safe API responses
export function createApiResponse<T>(
  data: T,
  status: number = 200
): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ data }, { status })
}

export function createApiError(
  error: string,
  status: number = 400
): NextResponse<ApiResponse> {
  return NextResponse.json({ error }, { status })
}

// Usage in API routes
export async function POST(request: NextRequest) {
  try {
    const contact = await ContactService.create(data)
    return createApiResponse(contact, 201)
  } catch (error) {
    return createApiError('Failed to create contact', 500)
  }
}
```

## AI Assistant Guidelines

### When Working on This CRM:

1. **Always Check Types First**: Look at the Prisma schema and existing type definitions
2. **Follow Established Patterns**: Use the patterns shown in this document
3. **Maintain Consistency**: Keep naming conventions and file structure consistent
4. **Think Service-First**: Put business logic in services, not in components or API routes
5. **Consider Performance**: Use appropriate database queries and caching strategies
6. **Test Coverage**: Add tests for new features following the patterns shown
7. **Security First**: Always implement proper authentication and authorization

### Quick Commands for Common Tasks:

```bash
# Database operations
npm run db:generate    # Generate Prisma client
npm run db:push        # Push schema changes
npm run db:seed        # Seed database with sample data

# Development
npm run dev           # Start development server
npm run build         # Build for production
npm run type-check    # Check TypeScript types

# Testing
npm run test:unit     # Run unit tests
npm run test:e2e      # Run E2E tests
npm run test:coverage # Generate coverage report
```

This context should provide everything needed for efficient AI-assisted development of the RealmKit CRM system.