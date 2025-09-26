# Contact Management Module

This module covers comprehensive contact management including creation, import/export, deduplication, and lifecycle management.

## Contact Architecture

### Contact Entity Design

```typescript
interface ContactEntity {
  // Core identity
  id: string
  type: 'PERSON' | 'COMPANY'
  
  // Personal info (for PERSON type)
  firstName?: string
  lastName?: string
  title?: string
  
  // Company info (for COMPANY type)
  companyName?: string
  
  // Contact details
  email?: string
  phone?: string
  mobile?: string
  website?: string
  
  // Business relationship
  status: ContactStatus
  source: string // Lead source
  ownerId: string // Assigned user
  companyId?: string // Associated company
  
  // Enrichment
  tags: string[]
  customFields: Record<string, any>
  socialProfiles: SocialProfile[]
  
  // Lifecycle
  lastContactedAt?: Date
  nextFollowUpAt?: Date
  lifecycleStage: LifecycleStage
}

enum ContactStatus {
  LEAD = 'LEAD',
  PROSPECT = 'PROSPECT', 
  QUALIFIED = 'QUALIFIED',
  CUSTOMER = 'CUSTOMER',
  INACTIVE = 'INACTIVE',
  UNQUALIFIED = 'UNQUALIFIED'
}

enum LifecycleStage {
  SUBSCRIBER = 'SUBSCRIBER',
  LEAD = 'LEAD',
  MARKETING_QUALIFIED = 'MARKETING_QUALIFIED',
  SALES_QUALIFIED = 'SALES_QUALIFIED',
  OPPORTUNITY = 'OPPORTUNITY',
  CUSTOMER = 'CUSTOMER',
  EVANGELIST = 'EVANGELIST'
}
```

## Database Schema Extensions

```prisma
model Contact {
  id          String      @id @default(cuid())
  type        ContactType @default(PERSON)
  
  // Personal information
  firstName   String?
  lastName    String?
  title       String?
  
  // Company information  
  companyName String?
  
  // Contact details
  email       String?     @unique
  phone       String?
  mobile      String?
  website     String?
  
  // Address
  address     String?
  city        String?
  state       String?
  country     String?
  postalCode  String?
  
  // Business relationship
  status         ContactStatus    @default(LEAD)
  source         String?
  lifecycleStage LifecycleStage  @default(LEAD)
  ownerId        String
  owner          User            @relation(fields: [ownerId], references: [id])
  companyId      String?
  company        Company?        @relation(fields: [companyId], references: [id])
  
  // Engagement tracking
  lastContactedAt  DateTime?
  nextFollowUpAt   DateTime?
  emailOptOut      Boolean       @default(false)
  smsOptOut        Boolean       @default(false)
  
  // Enrichment
  tags            String[]
  customFields    Json?
  socialProfiles  SocialProfile[]
  
  // Lead scoring
  leadScore       Int           @default(0)
  engagementScore Int           @default(0)
  
  // Related entities
  deals           Deal[]
  activities      Activity[]
  tasks           Task[]
  notes           Note[]
  emails          Email[]
  
  // Audit trail
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  createdBy       String
  updatedBy       String?
  
  @@map("contacts")
  @@index([email])
  @@index([ownerId])
  @@index([companyId])
  @@index([status])
  @@index([lifecycleStage])
  @@index([lastContactedAt])
}

model SocialProfile {
  id        String  @id @default(cuid())
  contactId String
  platform  String  // linkedin, twitter, facebook, etc.
  url       String
  username  String?
  
  contact   Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  
  @@unique([contactId, platform])
  @@map("social_profiles")
}
```

## Contact Service Implementation

```typescript
export class ContactService extends BaseService<Contact> {
  protected get tableName() { return 'contact' }
  
  async createContact(data: ContactCreateInput): Promise<Contact> {
    // Check for duplicates first
    const duplicates = await this.findDuplicates(data)
    if (duplicates.length > 0) {
      throw new DuplicateError('Potential duplicate contacts found', duplicates)
    }
    
    // Enrich contact data
    const enrichedData = await this.enrichContactData(data)
    
    return this.create({
      ...enrichedData,
      leadScore: this.calculateInitialLeadScore(enrichedData),
      lifecycleStage: this.determineLifecycleStage(enrichedData)
    })
  }
  
  async findDuplicates(contact: Partial<Contact>): Promise<Contact[]> {
    const conditions: any[] = []
    
    // Email match (exact)
    if (contact.email) {
      conditions.push({ email: contact.email })
    }
    
    // Name + Company match (fuzzy)
    if (contact.firstName && contact.lastName && contact.companyName) {
      conditions.push({
        AND: [
          { firstName: { contains: contact.firstName, mode: 'insensitive' } },
          { lastName: { contains: contact.lastName, mode: 'insensitive' } },
          { companyName: { contains: contact.companyName, mode: 'insensitive' } }
        ]
      })
    }
    
    // Phone match (normalized)
    if (contact.phone) {
      const normalizedPhone = this.normalizePhone(contact.phone)
      conditions.push({
        OR: [
          { phone: normalizedPhone },
          { mobile: normalizedPhone }
        ]
      })
    }
    
    if (conditions.length === 0) return []
    
    return this.db.contact.findMany({
      where: { OR: conditions },
      include: {
        company: true,
        owner: { select: { id: true, name: true } }
      }
    })
  }
  
  async mergeContacts(
    primaryId: string,
    duplicateIds: string[]
  ): Promise<Contact> {
    return this.db.$transaction(async (tx) => {
      const primary = await tx.contact.findUnique({
        where: { id: primaryId },
        include: {
          deals: true,
          activities: true,
          notes: true,
          socialProfiles: true
        }
      })
      
      if (!primary) {
        throw new NotFoundError('Primary contact')
      }
      
      const duplicates = await tx.contact.findMany({
        where: { id: { in: duplicateIds } },
        include: {
          deals: true,
          activities: true,
          notes: true,
          socialProfiles: true
        }
      })
      
      // Merge data from duplicates into primary
      const mergedData = this.mergeContactData(primary, duplicates)
      
      // Update related records to point to primary
      for (const duplicate of duplicates) {
        await Promise.all([
          tx.deal.updateMany({
            where: { contactId: duplicate.id },
            data: { contactId: primaryId }
          }),
          tx.activity.updateMany({
            where: { contactId: duplicate.id },
            data: { contactId: primaryId }
          }),
          tx.note.updateMany({
            where: { contactId: duplicate.id },
            data: { contactId: primaryId }
          })
        ])
      }
      
      // Delete duplicates
      await tx.contact.deleteMany({
        where: { id: { in: duplicateIds } }
      })
      
      // Update primary with merged data
      return tx.contact.update({
        where: { id: primaryId },
        data: mergedData,
        include: {
          company: true,
          owner: true,
          deals: { take: 10 },
          activities: { take: 10, orderBy: { createdAt: 'desc' } }
        }
      })
    })
  }
  
  async updateLeadScore(contactId: string): Promise<number> {
    const contact = await this.findById(contactId)
    if (!contact) throw new NotFoundError('Contact')
    
    const score = await this.calculateLeadScore(contact)
    
    await this.update(contactId, { leadScore: score })
    return score
  }
  
  private async enrichContactData(data: ContactCreateInput): Promise<ContactCreateInput> {
    const enriched = { ...data }
    
    // Company enrichment
    if (enriched.email && !enriched.companyName) {
      const domain = enriched.email.split('@')[1]
      const company = await this.findCompanyByDomain(domain)
      if (company) {
        enriched.companyId = company.id
        enriched.companyName = company.name
      }
    }
    
    // Social profile enrichment
    if (enriched.email) {
      const profiles = await this.findSocialProfiles(enriched.email)
      enriched.socialProfiles = profiles
    }
    
    return enriched
  }
  
  private calculateInitialLeadScore(contact: ContactCreateInput): number {
    let score = 0
    
    // Contact completeness
    if (contact.email) score += 20
    if (contact.phone) score += 15
    if (contact.companyName) score += 10
    if (contact.title) score += 10
    
    // Company size/quality
    if (contact.companyId) {
      // Add score based on company size, revenue, etc.
      score += 20
    }
    
    // Source quality
    const sourceScores: Record<string, number> = {
      'referral': 30,
      'website': 25,
      'linkedin': 20,
      'cold_email': 10,
      'purchased_list': 5
    }
    
    if (contact.source && sourceScores[contact.source]) {
      score += sourceScores[contact.source]
    }
    
    return Math.min(score, 100) // Cap at 100
  }
  
  private async calculateLeadScore(contact: Contact): Promise<number> {
    let score = this.calculateInitialLeadScore(contact)
    
    // Recent activity boost
    const recentActivities = await this.db.activity.count({
      where: {
        contactId: contact.id,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days
        }
      }
    })
    score += Math.min(recentActivities * 5, 25)
    
    // Email engagement
    const emailEngagement = await this.getEmailEngagementScore(contact.id)
    score += emailEngagement
    
    // Deal involvement
    const activeDeals = await this.db.deal.count({
      where: {
        contactId: contact.id,
        status: { in: ['PROPOSAL', 'NEGOTIATION'] }
      }
    })
    score += activeDeals * 15
    
    return Math.min(score, 100)
  }
}
```

## Import/Export System

```typescript
export class ContactImportService {
  constructor(private contactService: ContactService) {}
  
  async importFromCSV(
    file: File,
    mapping: FieldMapping,
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    const records = await this.parseCSV(file)
    const results: ImportResult = {
      total: records.length,
      success: 0,
      failed: 0,
      duplicates: 0,
      errors: []
    }
    
    for (const record of records) {
      try {
        const contactData = this.mapFields(record, mapping)
        
        // Validate
        const validated = ContactCreateSchema.parse(contactData)
        
        // Check for duplicates if enabled
        if (options.checkDuplicates) {
          const duplicates = await this.contactService.findDuplicates(validated)
          if (duplicates.length > 0) {
            if (options.skipDuplicates) {
              results.duplicates++
              continue
            } else if (options.updateDuplicates) {
              await this.contactService.update(duplicates[0].id, validated)
              results.success++
              continue
            }
          }
        }
        
        await this.contactService.create(validated)
        results.success++
        
      } catch (error) {
        results.failed++
        results.errors.push({
          row: records.indexOf(record) + 1,
          error: error.message,
          data: record
        })
      }
    }
    
    return results
  }
  
  async exportToCSV(filters: ContactFilters = {}): Promise<string> {
    const contacts = await this.contactService.searchContacts('', filters)
    
    const headers = [
      'ID', 'First Name', 'Last Name', 'Email', 'Phone', 'Company',
      'Title', 'Status', 'Source', 'Owner', 'Created', 'Last Contacted'
    ]
    
    const rows = contacts.map(contact => [
      contact.id,
      contact.firstName || '',
      contact.lastName || '',
      contact.email || '',
      contact.phone || '',
      contact.company?.name || contact.companyName || '',
      contact.title || '',
      contact.status,
      contact.source || '',
      contact.owner.name || '',
      contact.createdAt.toISOString(),
      contact.lastContactedAt?.toISOString() || ''
    ])
    
    return this.generateCSV([headers, ...rows])
  }
  
  private mapFields(record: any, mapping: FieldMapping): Partial<Contact> {
    const mapped: Partial<Contact> = {}
    
    Object.entries(mapping).forEach(([field, column]) => {
      if (record[column] !== undefined) {
        mapped[field] = this.transformValue(field, record[column])
      }
    })
    
    return mapped
  }
  
  private transformValue(field: string, value: any): any {
    switch (field) {
      case 'email':
        return value.toLowerCase().trim()
      case 'phone':
        return this.normalizePhone(value)
      case 'tags':
        return typeof value === 'string' ? value.split(',').map(t => t.trim()) : value
      case 'status':
        return value.toUpperCase()
      default:
        return value
    }
  }
}

interface ImportOptions {
  checkDuplicates?: boolean
  skipDuplicates?: boolean
  updateDuplicates?: boolean
  batchSize?: number
}

interface ImportResult {
  total: number
  success: number
  failed: number
  duplicates: number
  errors: ImportError[]
}

interface ImportError {
  row: number
  error: string
  data: any
}
```

## Contact Lifecycle Management

```typescript
export class ContactLifecycleService {
  constructor(
    private contactService: ContactService,
    private activityService: ActivityService
  ) {}
  
  async progressLifecycleStage(
    contactId: string,
    newStage: LifecycleStage,
    reason?: string
  ): Promise<Contact> {
    const contact = await this.contactService.findById(contactId)
    if (!contact) throw new NotFoundError('Contact')
    
    const currentStage = contact.lifecycleStage
    if (!this.isValidProgression(currentStage, newStage)) {
      throw new CRMError(
        `Invalid lifecycle progression from ${currentStage} to ${newStage}`,
        'INVALID_PROGRESSION'
      )
    }
    
    // Update contact
    const updated = await this.contactService.update(contactId, {
      lifecycleStage: newStage,
      status: this.mapLifecycleToStatus(newStage)
    })
    
    // Log the lifecycle change
    await this.activityService.create({
      type: 'LIFECYCLE_CHANGE',
      contactId,
      description: `Lifecycle stage changed from ${currentStage} to ${newStage}${reason ? `: ${reason}` : ''}`,
      metadata: {
        previousStage: currentStage,
        newStage,
        reason
      }
    })
    
    return updated
  }
  
  async calculateNextActions(contactId: string): Promise<NextAction[]> {
    const contact = await this.contactService.findById(contactId)
    if (!contact) return []
    
    const actions: NextAction[] = []
    const daysSinceLastContact = this.daysSince(contact.lastContactedAt)
    
    switch (contact.lifecycleStage) {
      case 'LEAD':
        if (daysSinceLastContact > 3) {
          actions.push({
            type: 'FOLLOW_UP_CALL',
            priority: 'HIGH',
            reason: 'New lead needs qualification call'
          })
        }
        break
        
      case 'MARKETING_QUALIFIED':
        actions.push({
          type: 'SALES_HANDOFF',
          priority: 'HIGH',
          reason: 'Ready for sales qualification'
        })
        break
        
      case 'SALES_QUALIFIED':
        if (!contact.deals?.length) {
          actions.push({
            type: 'CREATE_OPPORTUNITY',
            priority: 'MEDIUM',
            reason: 'Qualified lead needs opportunity'
          })
        }
        break
        
      case 'CUSTOMER':
        if (daysSinceLastContact > 30) {
          actions.push({
            type: 'CHECK_IN',
            priority: 'LOW',
            reason: 'Regular customer check-in'
          })
        }
        break
    }
    
    return actions
  }
  
  private isValidProgression(
    current: LifecycleStage,
    next: LifecycleStage
  ): boolean {
    const progressionMap: Record<LifecycleStage, LifecycleStage[]> = {
      'SUBSCRIBER': ['LEAD'],
      'LEAD': ['MARKETING_QUALIFIED', 'SALES_QUALIFIED'],
      'MARKETING_QUALIFIED': ['SALES_QUALIFIED', 'LEAD'],
      'SALES_QUALIFIED': ['OPPORTUNITY', 'MARKETING_QUALIFIED'],
      'OPPORTUNITY': ['CUSTOMER', 'SALES_QUALIFIED'],
      'CUSTOMER': ['EVANGELIST'],
      'EVANGELIST': []
    }
    
    return progressionMap[current]?.includes(next) || false
  }
  
  private mapLifecycleToStatus(stage: LifecycleStage): ContactStatus {
    const mapping: Record<LifecycleStage, ContactStatus> = {
      'SUBSCRIBER': 'LEAD',
      'LEAD': 'LEAD',
      'MARKETING_QUALIFIED': 'PROSPECT',
      'SALES_QUALIFIED': 'QUALIFIED',
      'OPPORTUNITY': 'QUALIFIED',
      'CUSTOMER': 'CUSTOMER',
      'EVANGELIST': 'CUSTOMER'
    }
    
    return mapping[stage]
  }
}

interface NextAction {
  type: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  reason: string
  dueDate?: Date
}
```

## API Routes

```typescript
// /api/contacts/[id]/merge/route.ts
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(async (session) => {
    const { duplicateIds } = await request.json()
    
    if (!duplicateIds?.length) {
      return NextResponse.json(
        { error: 'Duplicate IDs required' },
        { status: 400 }
      )
    }
    
    try {
      const contactService = new ContactService(db)
      const merged = await contactService.mergeContacts(params.id, duplicateIds)
      
      return NextResponse.json(merged)
    } catch (error) {
      return handleServiceError(error)
    }
  })
}

// /api/contacts/import/route.ts
export async function POST(request: NextRequest) {
  return withAuth(async (session) => {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const mapping = JSON.parse(formData.get('mapping') as string)
    const options = JSON.parse(formData.get('options') as string || '{}')
    
    try {
      const importService = new ContactImportService(new ContactService(db))
      const result = await importService.importFromCSV(file, mapping, options)
      
      return NextResponse.json(result)
    } catch (error) {
      return handleServiceError(error)
    }
  })
}

// /api/contacts/export/route.ts
export async function GET(request: NextRequest) {
  return withAuth(async (session) => {
    const { searchParams } = new URL(request.url)
    const filters = {
      status: searchParams.get('status'),
      ownerId: searchParams.get('ownerId')
    }
    
    try {
      const importService = new ContactImportService(new ContactService(db))
      const csv = await importService.exportToCSV(filters)
      
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename=contacts.csv'
        }
      })
    } catch (error) {
      return handleServiceError(error)
    }
  })
}
```

This contact management module provides comprehensive functionality for managing customer relationships with advanced features like duplicate detection, data enrichment, and lifecycle management.