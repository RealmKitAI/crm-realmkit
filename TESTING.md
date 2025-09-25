# Testing Guide - RealmKit CRM

## Overview

The RealmKit CRM includes a comprehensive testing strategy covering unit tests, integration tests, and end-to-end (E2E) tests. This document provides guidance on running tests, writing new tests, and understanding our testing patterns.

## Test Structure

```
tests/
├── unit/                    # Unit tests for services and utilities
│   ├── services/           # Service layer tests
│   ├── lib/                # Library function tests
│   └── utils/              # Utility function tests
├── integration/            # API integration tests
│   ├── api/                # API route tests
│   └── database/           # Database integration tests
├── e2e/                    # End-to-end tests
│   ├── auth/               # Authentication flows
│   ├── contacts/           # Contact management
│   ├── deals/              # Deal pipeline
│   └── dashboard/          # Dashboard functionality
├── fixtures/               # Test data and fixtures
├── __mocks__/              # Mock implementations
└── setup/                  # Test configuration
    ├── jest.setup.ts       # Jest configuration
    ├── test-db.ts          # Test database setup
    └── test-utils.tsx      # React testing utilities
```

## Running Tests

### All Tests
```bash
# Run complete test suite
npm test

# Run tests with coverage
npm run test:coverage
```

### Specific Test Types
```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# E2E tests only
npm run test:e2e

# Watch mode for development
npm run test:watch
```

### Playwright E2E Tests
```bash
# Run E2E tests
npm run test:e2e

# Run E2E tests with UI
npm run test:ui

# Run E2E tests in debug mode
npm run test:debug
```

## Writing Tests

### Unit Tests

**Service Tests Example:**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ContactService } from '@/services/contact.service'
import { prismaMock } from '../../__mocks__/prisma'

vi.mock('@/lib/db', () => ({
  prisma: prismaMock
}))

describe('ContactService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('should create a contact successfully', async () => {
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

    it('should handle validation errors', async () => {
      const invalidData = {
        name: '',
        email: 'invalid-email'
      }

      await expect(ContactService.create(invalidData))
        .rejects
        .toThrow('Validation failed')
    })
  })

  describe('findMany', () => {
    it('should return paginated contacts', async () => {
      const mockContacts = [
        { id: '1', name: 'John Doe', email: 'john@example.com' },
        { id: '2', name: 'Jane Smith', email: 'jane@example.com' }
      ]

      prismaMock.contact.findMany.mockResolvedValue(mockContacts)
      prismaMock.contact.count.mockResolvedValue(2)

      const result = await ContactService.findMany({}, { page: 1, limit: 10 })

      expect(result.contacts).toEqual(mockContacts)
      expect(result.pagination.total).toBe(2)
    })
  })
})
```

### Integration Tests

**API Route Tests:**
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testApiHandler } from 'next-test-api-route-handler'
import handler from '@/app/api/contacts/route'
import { setupTestDatabase, cleanupTestDatabase } from '../setup/test-db'

describe('/api/contacts', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await cleanupTestDatabase()
  })

  describe('POST /api/contacts', () => {
    it('should create a new contact', async () => {
      await testApiHandler({
        handler,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer mock-token'
            },
            body: JSON.stringify({
              name: 'Test Contact',
              email: 'test@example.com',
              phone: '+1-555-0123'
            })
          })

          expect(response.status).toBe(201)
          
          const contact = await response.json()
          expect(contact.data.name).toBe('Test Contact')
          expect(contact.data.email).toBe('test@example.com')
        }
      })
    })

    it('should return 400 for invalid data', async () => {
      await testApiHandler({
        handler,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer mock-token'
            },
            body: JSON.stringify({
              name: '',
              email: 'invalid-email'
            })
          })

          expect(response.status).toBe(400)
          
          const error = await response.json()
          expect(error.error).toContain('Validation failed')
        }
      })
    })
  })

  describe('GET /api/contacts', () => {
    it('should return paginated contacts', async () => {
      await testApiHandler({
        handler,
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'GET',
            headers: {
              'Authorization': 'Bearer mock-token'
            }
          })

          expect(response.status).toBe(200)
          
          const result = await response.json()
          expect(result.data).toHaveProperty('contacts')
          expect(result.data).toHaveProperty('pagination')
          expect(Array.isArray(result.data.contacts)).toBe(true)
        }
      })
    })
  })
})
```

### E2E Tests

**Contact Management Flow:**
```typescript
import { test, expect } from '@playwright/test'

test.describe('Contact Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login as test user
    await page.goto('/auth/signin')
    await page.fill('[data-testid="email"]', 'test@crm.com')
    await page.fill('[data-testid="password"]', 'password123')
    await page.click('[data-testid="signin-button"]')
    await page.waitForURL('/dashboard')
  })

  test('should create a new contact', async ({ page }) => {
    // Navigate to contacts page
    await page.goto('/dashboard/contacts')
    await expect(page).toHaveTitle(/Contacts/)

    // Click create contact button
    await page.click('[data-testid="create-contact-button"]')
    await expect(page.locator('[data-testid="contact-form"]')).toBeVisible()

    // Fill out contact form
    await page.fill('[data-testid="contact-name"]', 'John Doe')
    await page.fill('[data-testid="contact-email"]', 'john@example.com')
    await page.fill('[data-testid="contact-phone"]', '+1-555-0123')
    await page.selectOption('[data-testid="contact-company"]', 'Acme Corp')

    // Submit form
    await page.click('[data-testid="save-contact-button"]')

    // Verify contact was created
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible()
    await expect(page.locator('[data-testid="contact-list"]')).toContainText('John Doe')
  })

  test('should edit an existing contact', async ({ page }) => {
    await page.goto('/dashboard/contacts')
    
    // Click on first contact in list
    await page.click('[data-testid="contact-row"]:first-child [data-testid="edit-button"]')
    
    // Update contact name
    await page.fill('[data-testid="contact-name"]', 'John Doe Updated')
    await page.click('[data-testid="save-contact-button"]')
    
    // Verify update
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible()
    await expect(page.locator('[data-testid="contact-list"]')).toContainText('John Doe Updated')
  })

  test('should delete a contact', async ({ page }) => {
    await page.goto('/dashboard/contacts')
    
    // Click delete button
    await page.click('[data-testid="contact-row"]:first-child [data-testid="delete-button"]')
    
    // Confirm deletion
    await page.click('[data-testid="confirm-delete-button"]')
    
    // Verify deletion
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible()
  })

  test('should search contacts', async ({ page }) => {
    await page.goto('/dashboard/contacts')
    
    // Enter search term
    await page.fill('[data-testid="search-input"]', 'John')
    await page.press('[data-testid="search-input"]', 'Enter')
    
    // Verify search results
    await expect(page.locator('[data-testid="contact-list"] tr')).toContainText('John')
  })

  test('should filter contacts by company', async ({ page }) => {
    await page.goto('/dashboard/contacts')
    
    // Select company filter
    await page.selectOption('[data-testid="company-filter"]', 'Acme Corp')
    
    // Verify filtered results
    const contactRows = page.locator('[data-testid="contact-row"]')
    await expect(contactRows).toHaveCount(1)
    await expect(contactRows.first()).toContainText('Acme Corp')
  })
})
```

## Test Data Management

### Fixtures

**Contact Fixtures:**
```typescript
// tests/fixtures/contacts.ts
export const contactFixtures = {
  johnDoe: {
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+1-555-0123',
    jobTitle: 'CTO',
    companyId: 'company-1'
  },
  
  janeSmith: {
    name: 'Jane Smith',
    email: 'jane@example.com',
    phone: '+1-555-0456',
    jobTitle: 'CEO',
    companyId: 'company-2'
  }
}

export const companyFixtures = {
  acmeCorp: {
    name: 'Acme Corporation',
    industry: 'TECHNOLOGY',
    size: 'MEDIUM',
    website: 'https://acme.com'
  }
}
```

### Database Setup

**Test Database Configuration:**
```typescript
// tests/setup/test-db.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_TEST_URL || 'postgresql://test:test@localhost:5433/crm_test'
    }
  }
})

export async function setupTestDatabase() {
  // Run migrations
  await prisma.$executeRaw`CREATE SCHEMA IF NOT EXISTS test`
  
  // Seed test data
  await seedTestData()
}

export async function cleanupTestDatabase() {
  // Clean up test data
  await prisma.contact.deleteMany()
  await prisma.company.deleteMany()
  await prisma.user.deleteMany()
}

export async function seedTestData() {
  // Create test users, companies, contacts, etc.
  const testUser = await prisma.user.create({
    data: {
      email: 'test@crm.com',
      name: 'Test User',
      password: 'hashed-password'
    }
  })

  return { testUser }
}
```

## Mocking Strategies

### Prisma Mock

```typescript
// tests/__mocks__/prisma.ts
import { PrismaClient } from '@prisma/client'
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended'

export const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>

beforeEach(() => {
  mockReset(prismaMock)
})
```

### API Mocks

```typescript
// tests/__mocks__/api.ts
import { http, HttpResponse } from 'msw'

export const apiMocks = [
  http.get('/api/contacts', () => {
    return HttpResponse.json({
      data: {
        contacts: [
          { id: '1', name: 'John Doe', email: 'john@example.com' }
        ],
        pagination: { total: 1, page: 1, limit: 20 }
      }
    })
  }),

  http.post('/api/contacts', () => {
    return HttpResponse.json({
      data: { id: '1', name: 'John Doe', email: 'john@example.com' }
    }, { status: 201 })
  })
]
```

## Performance Testing

### Load Testing

```bash
# Install k6 for load testing
brew install k6

# Run load tests
k6 run tests/performance/api-load-test.js
```

**Load Test Example:**
```javascript
// tests/performance/api-load-test.js
import http from 'k6/http'
import { check } from 'k6'

export let options = {
  stages: [
    { duration: '2m', target: 10 }, // Ramp up
    { duration: '5m', target: 50 }, // Stay at 50 users
    { duration: '2m', target: 0 },  // Ramp down
  ],
}

export default function () {
  let response = http.get('http://localhost:3000/api/contacts')
  
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  })
}
```

## Continuous Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: crm_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Generate Prisma client
      run: npx prisma generate

    - name: Run database migrations
      run: npx prisma migrate deploy
      env:
        DATABASE_URL: postgresql://postgres:postgres@localhost:5432/crm_test

    - name: Run unit tests
      run: npm run test:unit

    - name: Run integration tests
      run: npm run test:integration
      env:
        DATABASE_URL: postgresql://postgres:postgres@localhost:5432/crm_test

    - name: Install Playwright browsers
      run: npx playwright install --with-deps

    - name: Run E2E tests
      run: npm run test:e2e
      env:
        PLAYWRIGHT_BASE_URL: http://localhost:3000

    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
```

## Test Coverage Goals

- **Unit Tests**: >80% coverage for services and utilities
- **Integration Tests**: All API endpoints covered
- **E2E Tests**: Critical user journeys covered
- **Performance**: API responses <500ms under normal load

## Debugging Tests

### Debug Unit Tests
```bash
# Debug with Node.js debugger
npm run test:unit -- --inspect-brk

# Debug specific test file
npm run test:unit -- ContactService.test.ts --inspect-brk
```

### Debug E2E Tests
```bash
# Run with headed browser
npm run test:e2e -- --headed

# Debug mode with pause
npm run test:debug

# Run specific test
npx playwright test contact-creation --debug
```

This comprehensive testing guide ensures the RealmKit CRM maintains high quality and reliability throughout development and deployment.