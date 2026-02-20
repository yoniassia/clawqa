import { describe, it, expect } from 'vitest';

describe('Test Cycles Data', () => {
  it('should have at least 7 test cycles', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const db = new PrismaClient({ datasources: { db: { url: 'file:./prisma/dev.db' } } });
    const cycles = await db.testCycle.findMany();
    expect(cycles.length).toBeGreaterThanOrEqual(7);
    await db.$disconnect();
  });

  it('each cycle should have valid steps JSON', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const db = new PrismaClient({ datasources: { db: { url: 'file:./prisma/dev.db' } } });
    const cycles = await db.testCycle.findMany();
    for (const cycle of cycles) {
      const steps = JSON.parse(cycle.stepsJson);
      expect(Array.isArray(steps)).toBe(true);
      expect(steps.length).toBeGreaterThan(0);
      // Steps can be strings or objects with instruction/expectedResult
      for (const step of steps) {
        if (typeof step === 'string') {
          expect(step.length).toBeGreaterThan(5);
        } else {
          expect(step).toHaveProperty('instruction');
          expect(step.instruction.length).toBeGreaterThan(5);
        }
      }
    }
    await db.$disconnect();
  });

  it('Clawdet should have 3 test cycles', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const db = new PrismaClient({ datasources: { db: { url: 'file:./prisma/dev.db' } } });
    const clawdet = await db.project.findUnique({ where: { slug: 'clawdet' }, include: { testCycles: true } });
    expect(clawdet!.testCycles.length).toBe(3);
    await db.$disconnect();
  });

  it('ClawQA should have 4 test cycles', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const db = new PrismaClient({ datasources: { db: { url: 'file:./prisma/dev.db' } } });
    const clawqa = await db.project.findUnique({ where: { slug: 'clawqa' }, include: { testCycles: true } });
    expect(clawqa!.testCycles.length).toBe(4);
    await db.$disconnect();
  });

  it('each cycle should have valid priority', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const db = new PrismaClient({ datasources: { db: { url: 'file:./prisma/dev.db' } } });
    const cycles = await db.testCycle.findMany();
    const validPriorities = ['critical', 'high', 'normal', 'low'];
    for (const cycle of cycles) {
      expect(validPriorities).toContain(cycle.priority);
    }
    await db.$disconnect();
  });
});
