# Deal Pipeline Management

This module covers sales pipeline management, deal stages, forecasting, and opportunity tracking in the CRM system.

## Deal Architecture

### Deal Entity Design

```typescript
interface DealEntity {
  // Core identity
  id: string
  name: string
  
  // Financial
  value: number
  currency: string
  probability: number // 0-100
  
  // Pipeline tracking
  stage: DealStage
  pipelineId: string
  expectedCloseDate: Date
  actualCloseDate?: Date
  
  // Relationships
  contactId: string
  companyId?: string
  ownerId: string
  
  // Source tracking
  source: string
  products: DealProduct[]
  
  // Metadata
  tags: string[]
  customFields: Record<string, any>
  lostReason?: string
  competitorId?: string
}

enum DealStage {
  LEAD = 'LEAD',
  QUALIFIED = 'QUALIFIED', 
  PROPOSAL = 'PROPOSAL',
  NEGOTIATION = 'NEGOTIATION',
  CLOSED_WON = 'CLOSED_WON',
  CLOSED_LOST = 'CLOSED_LOST'
}

enum DealPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}
```

## Database Schema

```prisma
model Pipeline {
  id          String @id @default(cuid())
  name        String
  description String?
  isDefault   Boolean @default(false)
  isActive    Boolean @default(true)
  
  // Configuration
  stages      PipelineStage[]
  deals       Deal[]
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@map("pipelines")
}

model PipelineStage {
  id          String  @id @default(cuid())
  pipelineId  String
  name        String
  probability Int     // Default probability for this stage
  sortOrder   Int
  isActive    Boolean @default(true)
  
  // Stage configuration
  rottenDays  Int?    // Days before deal is considered rotten
  color       String  @default("#3B82F6")
  
  pipeline    Pipeline @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  deals       Deal[]
  
  @@unique([pipelineId, sortOrder])
  @@map("pipeline_stages")
}

model Deal {
  id                String       @id @default(cuid())
  name              String
  value             Decimal      @db.Decimal(12, 2)
  currency          String       @default("USD")
  probability       Int          // 0-100
  priority          DealPriority @default(MEDIUM)
  
  // Pipeline tracking
  pipelineId        String
  stageId           String
  expectedCloseDate DateTime
  actualCloseDate   DateTime?
  
  // Relationships
  contactId         String
  companyId         String?
  ownerId           String
  
  contact           Contact      @relation(fields: [contactId], references: [id])
  company           Company?     @relation(fields: [companyId], references: [id])
  owner             User         @relation(fields: [ownerId], references: [id])
  pipeline          Pipeline     @relation(fields: [pipelineId], references: [id])
  stage             PipelineStage @relation(fields: [stageId], references: [id])
  
  // Source and tracking
  source            String?
  lostReason        String?
  competitorId      String?
  competitor        Competitor?  @relation(fields: [competitorId], references: [id])
  
  // Products and pricing
  products          DealProduct[]
  
  // Engagement
  activities        Activity[]
  tasks             Task[]
  notes             Note[]
  
  // Metadata
  tags              String[]
  customFields      Json?
  
  // Audit
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt
  stageChangedAt    DateTime     @default(now())
  
  @@map("deals")
  @@index([ownerId])
  @@index([stageId])
  @@index([expectedCloseDate])
  @@index([contactId])
}

model DealProduct {
  id          String  @id @default(cuid())
  dealId      String
  productId   String
  name        String  // Snapshot of product name
  quantity    Int     @default(1)
  unitPrice   Decimal @db.Decimal(10, 2)
  totalPrice  Decimal @db.Decimal(12, 2)
  discount    Decimal @default(0) @db.Decimal(5, 2) // Percentage
  
  deal        Deal    @relation(fields: [dealId], references: [id], onDelete: Cascade)
  product     Product @relation(fields: [productId], references: [id])
  
  @@map("deal_products")
}

model Product {
  id          String @id @default(cuid())
  name        String
  description String?
  price       Decimal @db.Decimal(10, 2)
  category    String?
  isActive    Boolean @default(true)
  
  dealProducts DealProduct[]
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@map("products")
}

model Competitor {
  id          String @id @default(cuid())
  name        String
  website     String?
  description String?
  
  deals       Deal[]
  
  @@map("competitors")
}
```

## Deal Service Implementation

```typescript
export class DealService extends BaseService<Deal> {
  protected get tableName() { return 'deal' }
  
  async createDeal(data: DealCreateInput): Promise<Deal> {
    // Auto-assign to first pipeline stage if not specified
    if (!data.stageId && data.pipelineId) {
      const firstStage = await this.db.pipelineStage.findFirst({
        where: { pipelineId: data.pipelineId },
        orderBy: { sortOrder: 'asc' }
      })
      if (firstStage) {
        data.stageId = firstStage.id
        data.probability = firstStage.probability
      }
    }
    
    // Calculate deal value from products
    if (data.products?.length) {
      data.value = this.calculateDealValue(data.products)
    }
    
    const deal = await this.create({
      ...data,
      stageChangedAt: new Date()
    })
    
    // Log deal creation activity
    await this.activityService.create({
      type: 'DEAL_CREATED',
      dealId: deal.id,
      contactId: deal.contactId,
      description: `Deal "${deal.name}" created with value ${this.formatCurrency(deal.value, deal.currency)}`
    })
    
    return deal
  }
  
  async moveDealToStage(
    dealId: string,
    stageId: string,
    reason?: string
  ): Promise<Deal> {
    const deal = await this.findById(dealId)
    if (!deal) throw new NotFoundError('Deal')
    
    const newStage = await this.db.pipelineStage.findUnique({
      where: { id: stageId }
    })
    if (!newStage) throw new NotFoundError('Pipeline stage')
    
    const oldStage = await this.db.pipelineStage.findUnique({
      where: { id: deal.stageId }
    })
    
    // Update deal
    const updated = await this.update(dealId, {
      stageId,
      probability: newStage.probability,
      stageChangedAt: new Date(),
      ...(newStage.name === 'Closed Won' && { actualCloseDate: new Date() }),
      ...(newStage.name === 'Closed Lost' && { actualCloseDate: new Date() })
    })
    
    // Log stage change activity
    await this.activityService.create({
      type: 'DEAL_STAGE_CHANGED',
      dealId,
      contactId: deal.contactId,
      description: `Deal moved from "${oldStage?.name}" to "${newStage.name}"${reason ? `: ${reason}` : ''}`,
      metadata: {
        previousStage: oldStage?.name,
        newStage: newStage.name,
        reason
      }
    })
    
    return updated
  }
  
  async updateDealValue(dealId: string, products: DealProductInput[]): Promise<Deal> {
    const deal = await this.findById(dealId)
    if (!deal) throw new NotFoundError('Deal')
    
    // Calculate new value
    const newValue = this.calculateDealValue(products)
    
    return this.db.$transaction(async (tx) => {
      // Remove existing products
      await tx.dealProduct.deleteMany({
        where: { dealId }
      })
      
      // Add new products
      await tx.dealProduct.createMany({
        data: products.map(p => ({
          dealId,
          productId: p.productId,
          name: p.name,
          quantity: p.quantity,
          unitPrice: p.unitPrice,
          totalPrice: new Decimal(p.quantity).mul(p.unitPrice).mul(new Decimal(100).sub(p.discount || 0).div(100)),
          discount: p.discount || 0
        }))
      })
      
      // Update deal value
      const updated = await tx.deal.update({
        where: { id: dealId },
        data: { value: newValue },
        include: {
          contact: true,
          company: true,
          stage: true,
          products: { include: { product: true } }
        }
      })
      
      // Log value change
      await this.activityService.create({
        type: 'DEAL_VALUE_CHANGED',
        dealId,
        contactId: deal.contactId,
        description: `Deal value updated to ${this.formatCurrency(newValue, deal.currency)}`,
        metadata: {
          previousValue: deal.value,
          newValue,
          products: products.length
        }
      })
      
      return updated
    })
  }
  
  async getRottenDeals(ownerId?: string): Promise<Deal[]> {
    const whereClause: any = {
      actualCloseDate: null, // Only open deals
      stage: {
        rottenDays: { not: null }
      }
    }
    
    if (ownerId) {
      whereClause.ownerId = ownerId
    }
    
    const deals = await this.db.deal.findMany({
      where: whereClause,
      include: {
        stage: true,
        contact: true,
        company: true
      }
    })
    
    // Filter deals that are actually rotten
    const now = new Date()
    return deals.filter(deal => {
      const daysSinceStageChange = Math.floor(
        (now.getTime() - deal.stageChangedAt.getTime()) / (1000 * 60 * 60 * 24)
      )
      return deal.stage.rottenDays && daysSinceStageChange > deal.stage.rottenDays
    })
  }
  
  async getDealsByStage(pipelineId: string): Promise<Record<string, Deal[]>> {
    const deals = await this.db.deal.findMany({
      where: {
        pipelineId,
        actualCloseDate: null
      },
      include: {
        contact: true,
        company: true,
        stage: true,
        products: true
      },
      orderBy: [
        { priority: 'desc' },
        { expectedCloseDate: 'asc' }
      ]
    })
    
    const stages = await this.db.pipelineStage.findMany({
      where: { pipelineId },
      orderBy: { sortOrder: 'asc' }
    })
    
    const result: Record<string, Deal[]> = {}
    stages.forEach(stage => {
      result[stage.id] = deals.filter(deal => deal.stageId === stage.id)
    })
    
    return result
  }
  
  private calculateDealValue(products: DealProductInput[]): number {
    return products.reduce((total, product) => {
      const subtotal = product.quantity * product.unitPrice
      const discount = subtotal * (product.discount || 0) / 100
      return total + (subtotal - discount)
    }, 0)
  }
}
```

## Forecasting Service

```typescript
export class ForecastingService {
  constructor(private dealService: DealService) {}
  
  async generateForecast(
    period: ForecastPeriod,
    options: ForecastOptions = {}
  ): Promise<Forecast> {
    const { startDate, endDate } = this.getPeriodDates(period)
    
    const deals = await this.db.deal.findMany({
      where: {
        expectedCloseDate: {
          gte: startDate,
          lte: endDate
        },
        actualCloseDate: null,
        ...(options.ownerId && { ownerId: options.ownerId }),
        ...(options.pipelineId && { pipelineId: options.pipelineId })
      },
      include: {
        stage: true,
        contact: true,
        company: true,
        owner: { select: { id: true, name: true } }
      }
    })
    
    const forecast: Forecast = {
      period,
      totalValue: 0,
      weightedValue: 0,
      dealCount: deals.length,
      byStage: {},
      byOwner: {},
      confidence: this.calculateConfidence(deals)
    }
    
    deals.forEach(deal => {
      const value = Number(deal.value)
      const weightedValue = value * (deal.probability / 100)
      
      forecast.totalValue += value
      forecast.weightedValue += weightedValue
      
      // By stage
      const stageName = deal.stage.name
      if (!forecast.byStage[stageName]) {
        forecast.byStage[stageName] = {
          count: 0,
          totalValue: 0,
          weightedValue: 0,
          averageProbability: 0
        }
      }
      
      forecast.byStage[stageName].count++
      forecast.byStage[stageName].totalValue += value
      forecast.byStage[stageName].weightedValue += weightedValue
      
      // By owner
      const ownerName = deal.owner.name || 'Unassigned'
      if (!forecast.byOwner[ownerName]) {
        forecast.byOwner[ownerName] = {
          count: 0,
          totalValue: 0,
          weightedValue: 0
        }
      }
      
      forecast.byOwner[ownerName].count++
      forecast.byOwner[ownerName].totalValue += value
      forecast.byOwner[ownerName].weightedValue += weightedValue
    })
    
    // Calculate average probabilities
    Object.keys(forecast.byStage).forEach(stageName => {
      const stageDeals = deals.filter(d => d.stage.name === stageName)
      forecast.byStage[stageName].averageProbability = 
        stageDeals.reduce((sum, d) => sum + d.probability, 0) / stageDeals.length
    })
    
    return forecast
  }
  
  async getConversionRates(pipelineId: string): Promise<ConversionRates> {
    // Get last 12 months of closed deals
    const endDate = new Date()
    const startDate = new Date()
    startDate.setFullYear(endDate.getFullYear() - 1)
    
    const deals = await this.db.deal.findMany({
      where: {
        pipelineId,
        actualCloseDate: {
          gte: startDate,
          lte: endDate
        }
      },
      include: { stage: true }
    })
    
    const stages = await this.db.pipelineStage.findMany({
      where: { pipelineId },
      orderBy: { sortOrder: 'asc' }
    })
    
    const conversionRates: ConversionRates = {}
    
    for (let i = 0; i < stages.length - 1; i++) {
      const currentStage = stages[i]
      const nextStage = stages[i + 1]
      
      const currentStageDeals = deals.filter(d => 
        this.dealPassedThroughStage(d, currentStage.id)
      )
      
      const nextStageDeals = deals.filter(d => 
        this.dealPassedThroughStage(d, nextStage.id)
      )
      
      const rate = currentStageDeals.length > 0 
        ? (nextStageDeals.length / currentStageDeals.length) * 100
        : 0
      
      conversionRates[`${currentStage.name}_to_${nextStage.name}`] = {
        from: currentStage.name,
        to: nextStage.name,
        rate,
        deals: currentStageDeals.length
      }
    }
    
    return conversionRates
  }
  
  private calculateConfidence(deals: Deal[]): number {
    if (deals.length === 0) return 0
    
    let confidenceScore = 0
    
    deals.forEach(deal => {
      // Recent activity increases confidence
      const daysSinceUpdate = Math.floor(
        (Date.now() - deal.updatedAt.getTime()) / (1000 * 60 * 60 * 24)
      )
      
      let dealConfidence = deal.probability
      
      // Reduce confidence for stale deals
      if (daysSinceUpdate > 7) dealConfidence *= 0.8
      if (daysSinceUpdate > 14) dealConfidence *= 0.7
      if (daysSinceUpdate > 30) dealConfidence *= 0.5
      
      // Increase confidence for deals with recent activity
      if (daysSinceUpdate <= 2) dealConfidence *= 1.1
      
      confidenceScore += Math.min(dealConfidence, 100)
    })
    
    return Math.round(confidenceScore / deals.length)
  }
}

interface Forecast {
  period: ForecastPeriod
  totalValue: number
  weightedValue: number
  dealCount: number
  confidence: number
  byStage: Record<string, StageMetrics>
  byOwner: Record<string, OwnerMetrics>
}

interface StageMetrics {
  count: number
  totalValue: number
  weightedValue: number
  averageProbability: number
}

interface ConversionRates {
  [key: string]: {
    from: string
    to: string
    rate: number
    deals: number
  }
}

enum ForecastPeriod {
  THIS_MONTH = 'THIS_MONTH',
  NEXT_MONTH = 'NEXT_MONTH',
  THIS_QUARTER = 'THIS_QUARTER',
  NEXT_QUARTER = 'NEXT_QUARTER'
}
```

## Pipeline Management

```typescript
export class PipelineService extends BaseService<Pipeline> {
  protected get tableName() { return 'pipeline' }
  
  async createPipeline(
    data: PipelineCreateInput,
    stages: PipelineStageInput[]
  ): Promise<Pipeline> {
    return this.db.$transaction(async (tx) => {
      const pipeline = await tx.pipeline.create({
        data: {
          name: data.name,
          description: data.description,
          isDefault: data.isDefault || false
        }
      })
      
      // If this is the default pipeline, unset others
      if (data.isDefault) {
        await tx.pipeline.updateMany({
          where: { id: { not: pipeline.id } },
          data: { isDefault: false }
        })
      }
      
      // Create stages
      await tx.pipelineStage.createMany({
        data: stages.map((stage, index) => ({
          pipelineId: pipeline.id,
          name: stage.name,
          probability: stage.probability,
          sortOrder: index,
          rottenDays: stage.rottenDays,
          color: stage.color || '#3B82F6'
        }))
      })
      
      return tx.pipeline.findUnique({
        where: { id: pipeline.id },
        include: {
          stages: { orderBy: { sortOrder: 'asc' } }
        }
      })
    })
  }
  
  async reorderStages(pipelineId: string, stageOrders: StageOrder[]): Promise<void> {
    await this.db.$transaction(
      stageOrders.map(({ stageId, sortOrder }) =>
        this.db.pipelineStage.update({
          where: { id: stageId },
          data: { sortOrder }
        })
      )
    )
  }
  
  async getPipelineMetrics(pipelineId: string): Promise<PipelineMetrics> {
    const pipeline = await this.db.pipeline.findUnique({
      where: { id: pipelineId },
      include: {
        stages: { orderBy: { sortOrder: 'asc' } },
        deals: {
          where: { actualCloseDate: null },
          include: { stage: true }
        }
      }
    })
    
    if (!pipeline) throw new NotFoundError('Pipeline')
    
    const metrics: PipelineMetrics = {
      totalDeals: pipeline.deals.length,
      totalValue: pipeline.deals.reduce((sum, deal) => sum + Number(deal.value), 0),
      averageDealSize: 0,
      stageMetrics: {}
    }
    
    metrics.averageDealSize = pipeline.deals.length > 0 
      ? metrics.totalValue / pipeline.deals.length 
      : 0
    
    pipeline.stages.forEach(stage => {
      const stageDeals = pipeline.deals.filter(deal => deal.stageId === stage.id)
      
      metrics.stageMetrics[stage.id] = {
        name: stage.name,
        dealCount: stageDeals.length,
        totalValue: stageDeals.reduce((sum, deal) => sum + Number(deal.value), 0),
        averageAge: this.calculateAverageStageAge(stageDeals)
      }
    })
    
    return metrics
  }
  
  private calculateAverageStageAge(deals: Deal[]): number {
    if (deals.length === 0) return 0
    
    const now = new Date()
    const totalDays = deals.reduce((sum, deal) => {
      const days = Math.floor(
        (now.getTime() - deal.stageChangedAt.getTime()) / (1000 * 60 * 60 * 24)
      )
      return sum + days
    }, 0)
    
    return Math.round(totalDays / deals.length)
  }
}
```

## API Routes

```typescript
// /api/deals/[id]/stage/route.ts
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(async (session) => {
    const { stageId, reason } = await request.json()
    
    if (!stageId) {
      return NextResponse.json(
        { error: 'Stage ID required' },
        { status: 400 }
      )
    }
    
    try {
      const dealService = new DealService(db)
      const deal = await dealService.moveDealToStage(params.id, stageId, reason)
      
      return NextResponse.json(deal)
    } catch (error) {
      return handleServiceError(error)
    }
  })
}

// /api/forecast/route.ts
export async function GET(request: NextRequest) {
  return withAuth(async (session) => {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') as ForecastPeriod
    const ownerId = searchParams.get('ownerId') || undefined
    const pipelineId = searchParams.get('pipelineId') || undefined
    
    try {
      const forecastingService = new ForecastingService(new DealService(db))
      const forecast = await forecastingService.generateForecast(period, {
        ownerId,
        pipelineId
      })
      
      return NextResponse.json(forecast)
    } catch (error) {
      return handleServiceError(error)
    }
  })
}
```

This deal management module provides comprehensive pipeline management, forecasting, and opportunity tracking capabilities for effective sales management.