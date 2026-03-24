import { PrismaClient, Prisma, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Field config type: each field can be set to visible/required.
// Omitted fields default to { visible: true, required: false }.
type FieldConfig = Record<string, { visible: boolean; required: boolean }>;

async function main() {
  console.log('Running production seed...');
  // Create default admin user
  const adminPassword = await argon2.hash('admin123');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@ghostcast.local' },
    update: {},
    create: {
      email: 'admin@ghostcast.local',
      passwordHash: adminPassword,
      firstName: 'System',
      lastName: 'Administrator',
      role: Role.ADMIN,
      isActive: true,
    },
  });
  console.log('Created admin user:', admin.email);
  
  // =========================================
  // 1. Project Types
  // =========================================
  const projectTypes: Array<{
    name: string;
    abbreviation: string;
    color: string;
    description: string;
    fieldConfig?: FieldConfig;
  }> = [
    {
      name: 'SpecterOps - Internal',
      abbreviation: '',
      color: '#808080',
      description: '',
      fieldConfig: {
        projectId: { visible: true, required: true },
        clientName: { visible: true, required: true },
        urlLink: { visible: true, required: false },
        requestedStartDate: { visible: true, required: true },
        requestedEndDate: { visible: true, required: false },
        timezone: { visible: true, required: false },
        travelRequired: { visible: true, required: false },
        studentCount: { visible: false, required: false },
        format: { visible: false, required: false },
        location: { visible: false, required: false },
        preparationWeeks: { visible: true, required: false },
        executionWeeks: { visible: true, required: true },
        reportingWeeks: { visible: true, required: false },
        requiredMembers: { visible: true, required: true },
        requiredSkills: { visible: true, required: true },
        description: { visible: true, required: false },
      },
    },    
    {
      name: 'Offensive Services - Red Team',
      abbreviation: 'RT',
      color: '#E02F35',
      description: '',
      fieldConfig: {
        projectId: { visible: true, required: true },
        clientName: { visible: true, required: true },
        urlLink: { visible: true, required: false },
        requestedStartDate: { visible: true, required: true },
        requestedEndDate: { visible: true, required: false },
        timezone: { visible: true, required: false },
        travelRequired: { visible: true, required: false },
        studentCount: { visible: false, required: false },
        format: { visible: false, required: false },
        location: { visible: false, required: false },
        preparationWeeks: { visible: true, required: false },
        executionWeeks: { visible: true, required: true },
        reportingWeeks: { visible: true, required: false },
        requiredMembers: { visible: true, required: true },
        requiredSkills: { visible: true, required: true },
        description: { visible: true, required: false },
      },
    },
    {
      name: 'Offensive Services - Penetration Test',
      abbreviation: 'PT',
      color: '#E02F35',
      description: '',
      fieldConfig: {
        projectId: { visible: true, required: true },
        clientName: { visible: true, required: true },
        urlLink: { visible: true, required: false },
        requestedStartDate: { visible: true, required: true },
        requestedEndDate: { visible: true, required: false },
        timezone: { visible: true, required: false },
        travelRequired: { visible: true, required: false },
        studentCount: { visible: false, required: false },
        format: { visible: false, required: false },
        location: { visible: false, required: false },
        preparationWeeks: { visible: true, required: false },
        executionWeeks: { visible: true, required: true },
        reportingWeeks: { visible: true, required: false },
        requiredMembers: { visible: true, required: true },
        requiredSkills: { visible: true, required: true },
        description: { visible: true, required: false },
      },
    },
    {
      name: 'Offensive Services - Advisory',
      abbreviation: 'ADV',
      color: '#E02F35',
      description: '',
      fieldConfig: {
        projectId: { visible: true, required: true },
        clientName: { visible: true, required: true },
        urlLink: { visible: true, required: false },
        requestedStartDate: { visible: true, required: true },
        requestedEndDate: { visible: true, required: false },
        timezone: { visible: true, required: false },
        travelRequired: { visible: true, required: false },
        studentCount: { visible: false, required: false },
        format: { visible: false, required: false },
        location: { visible: false, required: false },
        preparationWeeks: { visible: true, required: false },
        executionWeeks: { visible: true, required: true },
        reportingWeeks: { visible: true, required: false },
        requiredMembers: { visible: true, required: true },
        requiredSkills: { visible: true, required: true },
        description: { visible: true, required: false },
      },
    },
    {
      name: 'Offensive Services - Maturity',
      abbreviation: 'MA',
      color: '#E02F35',
      description: '',
      fieldConfig: {
        projectId: { visible: true, required: true },
        clientName: { visible: true, required: true },
        urlLink: { visible: true, required: false },
        requestedStartDate: { visible: true, required: true },
        requestedEndDate: { visible: true, required: false },
        timezone: { visible: true, required: false },
        travelRequired: { visible: true, required: false },
        studentCount: { visible: false, required: false },
        format: { visible: false, required: false },
        location: { visible: false, required: false },
        preparationWeeks: { visible: true, required: false },
        executionWeeks: { visible: true, required: true },
        reportingWeeks: { visible: true, required: false },
        requiredMembers: { visible: true, required: true },
        requiredSkills: { visible: true, required: true },
        description: { visible: true, required: false },
      },
    },
    {
      name: 'Offensive Services - Attack Path',
      abbreviation: 'APA',
      color: '#E02F35',
      description: '',
      fieldConfig: {
        projectId: { visible: true, required: true },
        clientName: { visible: true, required: true },
        urlLink: { visible: true, required: false },
        requestedStartDate: { visible: true, required: true },
        requestedEndDate: { visible: true, required: false },
        timezone: { visible: true, required: false },
        travelRequired: { visible: true, required: false },
        studentCount: { visible: false, required: false },
        format: { visible: false, required: false },
        location: { visible: false, required: false },
        preparationWeeks: { visible: true, required: false },
        executionWeeks: { visible: true, required: true },
        reportingWeeks: { visible: true, required: false },
        requiredMembers: { visible: true, required: true },
        requiredSkills: { visible: true, required: true },
        description: { visible: true, required: false },
      },
    },
    {
      name: 'Offensive Services - Web Application',
      abbreviation: 'WAPT',
      color: '#E02F35',
      description: '',
      fieldConfig: {
        projectId: { visible: true, required: true },
        clientName: { visible: true, required: true },
        urlLink: { visible: true, required: false },
        requestedStartDate: { visible: true, required: true },
        requestedEndDate: { visible: true, required: false },
        timezone: { visible: true, required: false },
        travelRequired: { visible: true, required: false },
        studentCount: { visible: false, required: false },
        format: { visible: false, required: false },
        location: { visible: false, required: false },
        preparationWeeks: { visible: true, required: false },
        executionWeeks: { visible: true, required: true },
        reportingWeeks: { visible: true, required: false },
        requiredMembers: { visible: true, required: true },
        requiredSkills: { visible: true, required: true },
        description: { visible: true, required: false },
      },
    },
    {
      name: 'Offensive Services - Physical',
      abbreviation: 'PHY',
      color: '#E02F35',
      description: 'Offensive services with a differentiator of evasion',
      fieldConfig: {
        projectId: { visible: true, required: true },
        clientName: { visible: true, required: true },
        urlLink: { visible: true, required: false },
        requestedStartDate: { visible: true, required: true },
        requestedEndDate: { visible: true, required: false },
        timezone: { visible: true, required: false },
        travelRequired: { visible: true, required: false },
        studentCount: { visible: false, required: false },
        format: { visible: false, required: false },
        location: { visible: false, required: false },
        preparationWeeks: { visible: true, required: false },
        executionWeeks: { visible: true, required: true },
        reportingWeeks: { visible: true, required: false },
        requiredMembers: { visible: true, required: true },
        requiredSkills: { visible: true, required: true },
        description: { visible: true, required: false },
      },
    },
    {
      name: 'Offensive Services - External',
      abbreviation: 'EXT',
      color: '#E02F35',
      description: 'Offensive services with a differentiator of evasion',
      fieldConfig: {
        projectId: { visible: true, required: true },
        clientName: { visible: true, required: true },
        urlLink: { visible: true, required: false },
        requestedStartDate: { visible: true, required: true },
        requestedEndDate: { visible: true, required: false },
        timezone: { visible: true, required: false },
        travelRequired: { visible: true, required: false },
        studentCount: { visible: false, required: false },
        format: { visible: false, required: false },
        location: { visible: false, required: false },
        preparationWeeks: { visible: true, required: false },
        executionWeeks: { visible: true, required: true },
        reportingWeeks: { visible: true, required: false },
        requiredMembers: { visible: true, required: true },
        requiredSkills: { visible: true, required: true },
        description: { visible: true, required: false },
      },
    },
    {
      name: 'Offensive Services - Misc',
      abbreviation: '',
      color: '#E02F35',
      description: '',
      fieldConfig: {
        projectId: { visible: true, required: true },
        clientName: { visible: true, required: true },
        urlLink: { visible: true, required: false },
        requestedStartDate: { visible: true, required: true },
        requestedEndDate: { visible: true, required: false },
        timezone: { visible: true, required: false },
        travelRequired: { visible: true, required: false },
        studentCount: { visible: false, required: false },
        format: { visible: false, required: false },
        location: { visible: false, required: false },
        preparationWeeks: { visible: true, required: false },
        executionWeeks: { visible: true, required: true },
        reportingWeeks: { visible: true, required: false },
        requiredMembers: { visible: true, required: true },
        requiredSkills: { visible: true, required: true },
        description: { visible: true, required: false },
      },
    },
    {
      name: 'Defensive Services - Advisory',
      abbreviation: 'ADV',
      color: '#5465FF',
      description: '',
      fieldConfig: {
        projectId: { visible: true, required: true },
        clientName: { visible: true, required: true },
        urlLink: { visible: true, required: false },
        requestedStartDate: { visible: true, required: true },
        requestedEndDate: { visible: true, required: false },
        timezone: { visible: true, required: false },
        travelRequired: { visible: true, required: false },
        studentCount: { visible: false, required: false },
        format: { visible: false, required: false },
        location: { visible: false, required: false },
        preparationWeeks: { visible: true, required: false },
        executionWeeks: { visible: true, required: true },
        reportingWeeks: { visible: true, required: false },
        requiredMembers: { visible: true, required: true },
        requiredSkills: { visible: true, required: true },
        description: { visible: true, required: false },
      },
    },
    {
      name: 'Defensive Services - Purple Team',
      abbreviation: 'PTA',
      color: '#5465FF',
      description: '',
      fieldConfig: {
        projectId: { visible: true, required: true },
        clientName: { visible: true, required: true },
        urlLink: { visible: true, required: false },
        requestedStartDate: { visible: true, required: true },
        requestedEndDate: { visible: true, required: false },
        timezone: { visible: true, required: false },
        travelRequired: { visible: true, required: false },
        studentCount: { visible: false, required: false },
        format: { visible: false, required: false },
        location: { visible: false, required: false },
        preparationWeeks: { visible: true, required: false },
        executionWeeks: { visible: true, required: true },
        reportingWeeks: { visible: true, required: false },
        requiredMembers: { visible: true, required: true },
        requiredSkills: { visible: true, required: true },
        description: { visible: true, required: false },
      },
    },
    {
      name: 'Defensive Services - Maturity',
      abbreviation: 'MA',
      color: '#5465FF',
      description: '',
      fieldConfig: {
        projectId: { visible: true, required: true },
        clientName: { visible: true, required: true },
        urlLink: { visible: true, required: false },
        requestedStartDate: { visible: true, required: true },
        requestedEndDate: { visible: true, required: false },
        timezone: { visible: true, required: false },
        travelRequired: { visible: true, required: false },
        studentCount: { visible: false, required: false },
        format: { visible: false, required: false },
        location: { visible: false, required: false },
        preparationWeeks: { visible: true, required: false },
        executionWeeks: { visible: true, required: true },
        reportingWeeks: { visible: true, required: false },
        requiredMembers: { visible: true, required: true },
        requiredSkills: { visible: true, required: true },
        description: { visible: true, required: false },
      },
    },
    {
      name: 'Defensive Services - Misc',
      abbreviation: '',
      color: '#5465FF',
      description: '',
      fieldConfig: {
        projectId: { visible: true, required: true },
        clientName: { visible: true, required: true },
        urlLink: { visible: true, required: false },
        requestedStartDate: { visible: true, required: true },
        requestedEndDate: { visible: true, required: false },
        timezone: { visible: true, required: false },
        travelRequired: { visible: true, required: false },
        studentCount: { visible: false, required: false },
        format: { visible: false, required: false },
        location: { visible: false, required: false },
        preparationWeeks: { visible: true, required: false },
        executionWeeks: { visible: true, required: true },
        reportingWeeks: { visible: true, required: false },
        requiredMembers: { visible: true, required: true },
        requiredSkills: { visible: true, required: true },
        description: { visible: true, required: false },
      },
    },                                            
    {
      name: 'Training - AT:RTO',
      abbreviation: 'RTO',
      color: '#00B36B',
      description: '',
      fieldConfig: {
        projectId: { visible: true, required: true },
        clientName: { visible: true, required: true },
        urlLink: { visible: true, required: false },
        requestedStartDate: { visible: true, required: true },
        requestedEndDate: { visible: true, required: false },
        timezone: { visible: true, required: false },
        travelRequired: { visible: false, required: false },
        studentCount: { visible: true, required: true },
        format: { visible: true, required: true },
        location: { visible: true, required: false },
        preparationWeeks: { visible: false, required: false },
        executionWeeks: { visible: false, required: false },
        reportingWeeks: { visible: false, required: false },
        requiredMembers: { visible: false, required: false },
        requiredSkills: { visible: false, required: false },
        description: { visible: true, required: false },
      },
    },
    {
      name: 'Training - AT:IDOT',
      abbreviation: 'IDOT',
      color: '#00B36B',
      description: '',
      fieldConfig: {
        projectId: { visible: true, required: true },
        clientName: { visible: true, required: true },
        urlLink: { visible: true, required: false },
        requestedStartDate: { visible: true, required: true },
        requestedEndDate: { visible: true, required: false },
        timezone: { visible: true, required: false },
        travelRequired: { visible: false, required: false },
        studentCount: { visible: true, required: true },
        format: { visible: true, required: true },
        location: { visible: true, required: false },
        preparationWeeks: { visible: false, required: false },
        executionWeeks: { visible: false, required: false },
        reportingWeeks: { visible: false, required: false },
        requiredMembers: { visible: false, required: false },
        requiredSkills: { visible: false, required: false },
        description: { visible: true, required: false },
      },
    },
    {
      name: 'Training - AT:TA',
      abbreviation: 'TA',
      color: '#00B36B',
      description: '',
      fieldConfig: {
        projectId: { visible: true, required: true },
        clientName: { visible: true, required: true },
        urlLink: { visible: true, required: false },
        requestedStartDate: { visible: true, required: true },
        requestedEndDate: { visible: true, required: false },
        timezone: { visible: true, required: false },
        travelRequired: { visible: false, required: false },
        studentCount: { visible: true, required: true },
        format: { visible: true, required: true },
        location: { visible: true, required: false },
        preparationWeeks: { visible: false, required: false },
        executionWeeks: { visible: false, required: false },
        reportingWeeks: { visible: false, required: false },
        requiredMembers: { visible: false, required: false },
        requiredSkills: { visible: false, required: false },
        description: { visible: true, required: false },
      },
    },
    {
      name: 'Training - AP:A',
      abbreviation: 'APA',
      color: '#00B36B',
      description: '',
      fieldConfig: {
        projectId: { visible: true, required: true },
        clientName: { visible: true, required: true },
        urlLink: { visible: true, required: false },
        requestedStartDate: { visible: true, required: true },
        requestedEndDate: { visible: true, required: false },
        timezone: { visible: true, required: false },
        travelRequired: { visible: false, required: false },
        studentCount: { visible: true, required: true },
        format: { visible: true, required: true },
        location: { visible: true, required: false },
        preparationWeeks: { visible: false, required: false },
        executionWeeks: { visible: false, required: false },
        reportingWeeks: { visible: false, required: false },
        requiredMembers: { visible: false, required: false },
        requiredSkills: { visible: false, required: false },
        description: { visible: true, required: false },
      },
    },
    {
      name: 'Training - AP:AD',
      abbreviation: 'APAD',
      color: '#00B36B',
      description: '',
      fieldConfig: {
        projectId: { visible: true, required: true },
        clientName: { visible: true, required: true },
        urlLink: { visible: true, required: false },
        requestedStartDate: { visible: true, required: true },
        requestedEndDate: { visible: true, required: false },
        timezone: { visible: true, required: false },
        travelRequired: { visible: false, required: false },
        studentCount: { visible: true, required: true },
        format: { visible: true, required: true },
        location: { visible: true, required: false },
        preparationWeeks: { visible: false, required: false },
        executionWeeks: { visible: false, required: false },
        reportingWeeks: { visible: false, required: false },
        requiredMembers: { visible: false, required: false },
        requiredSkills: { visible: false, required: false },
        description: { visible: true, required: false },
      },
    },
    {
      name: 'Training - Misc',
      abbreviation: '',
      color: '#00B36B',
      description: '',
      fieldConfig: {
        projectId: { visible: true, required: true },
        clientName: { visible: true, required: true },
        urlLink: { visible: true, required: false },
        requestedStartDate: { visible: true, required: true },
        requestedEndDate: { visible: true, required: false },
        timezone: { visible: true, required: false },
        travelRequired: { visible: false, required: false },
        studentCount: { visible: true, required: true },
        format: { visible: true, required: true },
        location: { visible: true, required: false },
        preparationWeeks: { visible: false, required: false },
        executionWeeks: { visible: false, required: false },
        reportingWeeks: { visible: false, required: false },
        requiredMembers: { visible: false, required: false },
        requiredSkills: { visible: false, required: false },
        description: { visible: true, required: false },
      },
    }                   
  ];

  for (const pt of projectTypes) {
    const { fieldConfig, ...rest } = pt;
    await prisma.projectType.upsert({
      where: { name: pt.name },
      update: {},
      create: {
        ...rest,
        fieldConfig: fieldConfig as Prisma.InputJsonValue | undefined,
      },
    });
  }
  console.log(`Seeded ${projectTypes.length} project types.`);

  // =========================================
  // 2. Formatters
  // =========================================
  const formatters = [
    { name: 'Project Lead', isBold: true, prefix: null, suffix: null },
    { name: 'Lead Instructor', isBold: false, prefix: null, suffix: ' (L)' },
    { name: 'Support Instructor', isBold: false, prefix: null, suffix: ' (Si)' },
    { name: 'Hunter', isBold: false, prefix: null, suffix: ' (H)' },
    { name: 'Travel', isBold: true, prefix: null, suffix: ' -' },
    { name: 'Report Writer', isBold: true, prefix: null, suffix: ' +' },
    { name: 'Student', isBold: true, prefix: null, suffix: ' (St)' },
    { name: 'Excessive Resource', isBold: true, prefix: null, suffix: ' *' },
    { name: 'Non-Billable', isBold: true, prefix: null, suffix: ' (NB)' },
    { name: 'No Travel', isBold: true, prefix: null, suffix: ' (NT)' },                    
  ];

  const formatterRecords: Record<string, { id: string }> = {};
  for (const f of formatters) {
    const record = await prisma.formatter.upsert({
      where: { name: f.name },
      update: {},
      create: {
        name: f.name,
        isBold: f.isBold,
        prefix: f.prefix,
        suffix: f.suffix,
        isActive: true,
      },
    });
    formatterRecords[f.name] = record;
  }
  console.log(`Seeded ${formatters.length} formatters.`);

  // =========================================
  // 3. Project Roles
  // =========================================
  const projectRoles = [
    { name: 'AT:RTO - Lead Instructor', description: '', color: '#00B36B' },
    { name: 'AT:RTO - Support Instructor', description: '', color: '#00B36B' },
    { name: 'AT:RTO - Hunter', description: '', color: '#00B36B' },
    { name: 'AT:RTO - Student', description: '', color: '#00B36B' },
    { name: 'AT:IDOT - Lead Instructor', description: '', color: '#00B36B' },
    { name: 'AT:IDOT - Support Instructor', description: '', color: '#00B36B' },
    { name: 'AT:IDOT - Hunter', description: '', color: '#00B36B' },    
    { name: 'AT:IDOT - Student', description: '', color: '#00B36B' },
    { name: 'AT:TA - Lead Instructor', description: '', color: '#00B36B' },
    { name: 'AT:TA - Support Instructor', description: '', color: '#00B36B' },
    { name: 'AT:TA - Student', description: '', color: '#00B36B' },
    { name: 'AT:D - Lead Instructor', description: '', color: '#00B36B' },
    { name: 'AT:D - Support Instructor', description: '', color: '#00B36B' },
    { name: 'AT:D - Student', description: '', color: '#00B36B' },
    { name: 'AP:A - Lead Instructor', description: '', color: '#00B36B' },
    { name: 'AP:A - Support Instructor', description: '', color: '#00B36B' },
    { name: 'AP:A - Student', description: '', color: '#00B36B' },
    { name: 'AP:AD - Lead Instructor', description: '', color: '#00B36B' },
    { name: 'AP:AD - Support Instructor', description: '', color: '#00B36B' },
    { name: 'AP:AD - Student', description: '', color: '#00B36B' },
    { name: 'Project Lead', description: 'Core team member executing project work', color: '#808080' },
    { name: 'Operator', description: 'Quality assurance and testing specialist', color: '#808080' },
    { name: 'Report Writer', description: 'Coordinates activities and removes blockers', color: '#808080' },
  ];

  const roleRecords: Record<string, { id: string }> = {};
  for (const role of projectRoles) {
    const record = await prisma.projectRole.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });
    roleRecords[role.name] = record;
  }
  console.log(`Seeded ${projectRoles.length} project roles.`);

  // =========================================
  // 4. ProjectRoleFormatter Associations
  // =========================================
  const roleFormatterAssociations = [
    { name: 'AT:RTO - Lead Instructor', formatterName: 'Lead Instructor' },
    { name: 'AT:RTO - Support Instructor', formatterName: 'Support Instructor' },
    { name: 'AT:RTO - Hunter', formatterName: 'Hunter' },
    { name: 'AT:RTO - Student', formatterName: 'Student' },
    { name: 'AT:IDOT - Lead Instructor', formatterName: 'Lead Instructor' },
    { name: 'AT:IDOT - Support Instructor', formatterName: 'Support Instructor' },
    { name: 'AT:IDOT - Hunter', formatterName: 'Hunter' },    
    { name: 'AT:IDOT - Student', formatterName: 'Student' },
    { name: 'AT:TA - Lead Instructor', formatterName: 'Lead Instructor' },
    { name: 'AT:TA - Support Instructor', formatterName: 'Support Instructor' },
    { name: 'AT:TA - Student', formatterName: 'Student' },
    { name: 'AT:D - Lead Instructor', formatterName: 'Lead Instructor' },
    { name: 'AT:D - Support Instructor', formatterName: 'Support Instructor' },
    { name: 'AT:D - Student', formatterName: 'Student' },
    { name: 'AP:A - Lead Instructor', formatterName: 'Lead Instructor' },
    { name: 'AP:A - Support Instructor', formatterName: 'Support Instructor' },
    { name: 'AP:A - Student', formatterName: 'Student' },
    { name: 'AP:AD - Lead Instructor', formatterName: 'Lead Instructor' },
    { name: 'AP:AD - Support Instructor', formatterName: 'Support Instructor' },
    { name: 'AP:AD - Student', formatterName: 'Student' },
    { name: 'Project Lead', formatterName: 'Project Lead' },
    { name: 'Report Writer', formatterName: 'Report Writer' },
  ];

  let associationCount = 0;
  for (const assoc of roleFormatterAssociations) {
    const role = roleRecords[assoc.name];
    const formatter = formatterRecords[assoc.formatterName];
    if (role && formatter) {
      await prisma.projectRoleFormatter.upsert({
        where: {
          projectRoleId_formatterId: {
            projectRoleId: role.id,
            formatterId: formatter.id,
          },
        },
        update: {},
        create: {
          projectRoleId: role.id,
          formatterId: formatter.id,
        },
      });
      associationCount++;
    }
  }
  console.log(`Seeded ${associationCount} project role formatter associations.`);

  // =========================================
  // 5. System Config
  // =========================================
  const configs = [
    { key: 'app.name', value: 'GhostCast', category: 'general' },
    { key: 'app.timezone', value: 'America/New_York', category: 'general' },
    { key: 'calendar.startDay', value: 1, category: 'calendar' },
    { key: 'calendar.endDay', value: 5, category: 'calendar' },
    { key: 'notifications.enabled', value: true, category: 'notifications' },
    { key: 'audit.retentionDays', value: 90, category: 'audit' },
  ];

  for (const config of configs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: { value: config.value },
      create: config,
    });
  }
  console.log(`Seeded ${configs.length} system configs.`);

  console.log('Production seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('Production seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
