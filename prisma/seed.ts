import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting CRM seed...')

  // Create demo users
  const hashedPassword = await bcrypt.hash('password123', 12)
  
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@crm.com' },
    update: {},
    create: {
      email: 'admin@crm.com',
      name: 'CRM Admin',
      password: hashedPassword,
      role: 'ADMIN',
      emailVerified: new Date(),
    },
  })

  const salesUser = await prisma.user.upsert({
    where: { email: 'sales@crm.com' },
    update: {},
    create: {
      email: 'sales@crm.com',
      name: 'Sales Representative',
      password: hashedPassword,
      role: 'USER',
      emailVerified: new Date(),
    },
  })

  console.log('👤 Created users:', { adminUser: adminUser.id, salesUser: salesUser.id })

  // Create sample companies
  const acmeCorp = await prisma.company.create({
    data: {
      name: 'Acme Corporation',
      industry: 'TECHNOLOGY',
      size: 'MEDIUM',
      website: 'https://acme.com',
      description: 'Leading technology solutions provider',
      address: '123 Tech Street, Silicon Valley, CA',
      createdBy: { connect: { id: adminUser.id } },
    },
  })

  const techStartup = await prisma.company.create({
    data: {
      name: 'TechStart Inc',
      industry: 'TECHNOLOGY',
      size: 'SMALL',
      website: 'https://techstart.com',
      description: 'Innovative startup building the future',
      address: '456 Startup Ave, San Francisco, CA',
      createdBy: { connect: { id: salesUser.id } },
    },
  })

  console.log('🏢 Created companies:', { acmeCorp: acmeCorp.id, techStartup: techStartup.id })

  // Create sample contacts
  const johnDoe = await prisma.contact.create({
    data: {
      name: 'John Doe',
      email: 'john@acme.com',
      phone: '+1-555-0123',
      jobTitle: 'CTO',
      status: 'ACTIVE',
      company: { connect: { id: acmeCorp.id } },
      user: { connect: { id: salesUser.id } },
      customFields: {
        'LinkedIn': 'https://linkedin.com/in/johndoe',
        'Preferred Contact Method': 'Email'
      },
      tags: ['decision-maker', 'technical']
    },
  })

  const janeSmith = await prisma.contact.create({
    data: {
      name: 'Jane Smith',
      email: 'jane@techstart.com',
      phone: '+1-555-0456',
      jobTitle: 'CEO',
      status: 'ACTIVE',
      company: { connect: { id: techStartup.id } },
      user: { connect: { id: adminUser.id } },
      customFields: {
        'LinkedIn': 'https://linkedin.com/in/janesmith',
        'Company Stage': 'Series A'
      },
      tags: ['founder', 'strategic']
    },
  })

  console.log('👥 Created contacts:', { johnDoe: johnDoe.id, janeSmith: janeSmith.id })

  // Create sample leads
  const lead1 = await prisma.lead.create({
    data: {
      name: 'Sarah Wilson',
      email: 'sarah@example.com',
      phone: '+1-555-0789',
      company: 'Wilson Industries',
      jobTitle: 'VP of Operations',
      status: 'WARM',
      source: 'WEBSITE',
      score: 75,
      user: { connect: { id: salesUser.id } },
      customFields: {
        'Budget Range': '$50K-100K',
        'Timeline': 'Q2 2024'
      },
      tags: ['high-priority', 'enterprise']
    },
  })

  const lead2 = await prisma.lead.create({
    data: {
      name: 'Mike Johnson',
      email: 'mike@startup.io',
      company: 'Startup.io',
      jobTitle: 'Founder',
      status: 'HOT',
      source: 'REFERRAL',
      score: 85,
      user: { connect: { id: adminUser.id } },
      customFields: {
        'Funding Stage': 'Seed',
        'Team Size': '15'
      },
      tags: ['startup', 'referral']
    },
  })

  console.log('🎯 Created leads:', { lead1: lead1.id, lead2: lead2.id })

  // Create sample deals
  const deal1 = await prisma.deal.create({
    data: {
      title: 'Acme Corp CRM Implementation',
      description: 'Enterprise CRM setup and integration',
      value: 75000,
      stage: 'PROPOSAL',
      probability: 0.5,
      expectedCloseDate: new Date('2024-03-15'),
      status: 'OPEN',
      user: { connect: { id: salesUser.id } },
      company: { connect: { id: acmeCorp.id } },
      contacts: { connect: [{ id: johnDoe.id }] },
      customFields: {
        'Implementation Timeline': '6 months',
        'Decision Committee': 'CTO, CFO, CEO'
      },
    },
  })

  const deal2 = await prisma.deal.create({
    data: {
      title: 'TechStart Sales Automation',
      description: 'Sales process automation and analytics',
      value: 25000,
      stage: 'NEGOTIATION',
      probability: 0.75,
      expectedCloseDate: new Date('2024-02-28'),
      status: 'OPEN',
      user: { connect: { id: adminUser.id } },
      company: { connect: { id: techStartup.id } },
      contacts: { connect: [{ id: janeSmith.id }] },
      customFields: {
        'Contract Type': 'Annual',
        'Payment Terms': 'Net 30'
      },
    },
  })

  console.log('💰 Created deals:', { deal1: deal1.id, deal2: deal2.id })

  // Create sample activities
  await prisma.activity.create({
    data: {
      type: 'EMAIL',
      subject: 'CRM Demo Follow-up',
      description: 'Sent follow-up email after product demo',
      entityType: 'CONTACT',
      entityId: johnDoe.id,
      user: { connect: { id: salesUser.id } },
      completedAt: new Date(),
      metadata: {
        emailSent: true,
        templateUsed: 'demo-followup'
      }
    },
  })

  await prisma.activity.create({
    data: {
      type: 'CALL',
      subject: 'Discovery Call with Jane',
      description: 'Initial discovery call to understand requirements',
      entityType: 'DEAL',
      entityId: deal2.id,
      user: { connect: { id: adminUser.id } },
      completedAt: new Date(),
      metadata: {
        duration: 45,
        outcome: 'positive',
        nextSteps: 'Send proposal'
      }
    },
  })

  await prisma.activity.create({
    data: {
      type: 'MEETING',
      subject: 'Product Demo Scheduled',
      description: 'Product demonstration for Acme Corp team',
      entityType: 'DEAL',
      entityId: deal1.id,
      user: { connect: { id: salesUser.id } },
      scheduledAt: new Date('2024-02-15T14:00:00Z'),
      metadata: {
        attendees: ['john@acme.com', 'cfo@acme.com'],
        location: 'Zoom',
        agenda: 'Product walkthrough and Q&A'
      }
    },
  })

  console.log('📋 Created sample activities')

  // Create sample tasks
  await prisma.task.create({
    data: {
      title: 'Prepare proposal for Acme Corp',
      description: 'Create detailed proposal with pricing and timeline',
      priority: 'HIGH',
      status: 'TODO',
      dueDate: new Date('2024-02-10'),
      entityType: 'DEAL',
      entityId: deal1.id,
      assignedTo: { connect: { id: salesUser.id } },
      createdBy: { connect: { id: salesUser.id } },
    },
  })

  await prisma.task.create({
    data: {
      title: 'Follow up with TechStart contract',
      description: 'Check on contract review status',
      priority: 'MEDIUM',
      status: 'IN_PROGRESS',
      dueDate: new Date('2024-02-08'),
      entityType: 'DEAL',
      entityId: deal2.id,
      assignedTo: { connect: { id: adminUser.id } },
      createdBy: { connect: { id: adminUser.id } },
    },
  })

  console.log('✅ Created sample tasks')

  // Create custom field definitions
  await prisma.customFieldDefinition.create({
    data: {
      name: 'LinkedIn Profile',
      key: 'linkedin_profile',
      type: 'TEXT',
      entityType: 'CONTACT',
      isRequired: false,
      description: 'LinkedIn profile URL',
      createdBy: { connect: { id: adminUser.id } },
    },
  })

  await prisma.customFieldDefinition.create({
    data: {
      name: 'Budget Range',
      key: 'budget_range',
      type: 'SELECT',
      entityType: 'LEAD',
      isRequired: false,
      options: ['<$10K', '$10K-50K', '$50K-100K', '$100K+'],
      description: 'Estimated budget for the project',
      createdBy: { connect: { id: adminUser.id } },
    },
  })

  await prisma.customFieldDefinition.create({
    data: {
      name: 'Implementation Timeline',
      key: 'implementation_timeline',
      type: 'TEXT',
      entityType: 'DEAL',
      isRequired: false,
      description: 'Expected implementation duration',
      createdBy: { connect: { id: adminUser.id } },
    },
  })

  console.log('🔧 Created custom field definitions')

  console.log('🌟 CRM seed completed successfully!')
  console.log('\n📊 Seeded data summary:')
  console.log('- 2 Users (admin@crm.com, sales@crm.com)')
  console.log('- 2 Companies (Acme Corp, TechStart Inc)')
  console.log('- 2 Contacts (John Doe, Jane Smith)')
  console.log('- 2 Leads (Sarah Wilson, Mike Johnson)')
  console.log('- 2 Deals ($100K total pipeline)')
  console.log('- 3 Activities (email, call, meeting)')
  console.log('- 2 Tasks (proposal prep, contract follow-up)')
  console.log('- 3 Custom field definitions')
  console.log('\n🔑 Login credentials:')
  console.log('- Admin: admin@crm.com / password123')
  console.log('- Sales: sales@crm.com / password123')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e)
    await prisma.$disconnect()
    process.exit(1)
  })