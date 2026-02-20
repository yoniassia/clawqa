import { NextRequest, NextResponse } from 'next/server';
import { getApplauseClient } from '@/lib/applause';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cycleId, reason } = body;
    if (!cycleId) return NextResponse.json({ error: 'cycleId required' }, { status: 400 });

    const applause = getApplauseClient();
    if (!applause.isConfigured) {
      return NextResponse.json({
        error: 'Applause not configured',
        message: 'Add APPLAUSE_API_KEY and APPLAUSE_PRODUCT_ID in settings to enable crowd testing escalation.',
        fallback: 'Manual testing mode — share test cycle URL with human testers directly.'
      }, { status: 503 });
    }

    const cycle = await prisma.testCycle.findUnique({ where: { id: cycleId }, include: { project: true } });
    if (!cycle) return NextResponse.json({ error: 'Test cycle not found' }, { status: 404 });

    const steps = JSON.parse(cycle.stepsJson || '[]');
    const testNames = steps.map((s: any, i: number) => {
      const name = s.instruction || s.step || s.title || s;
      return typeof name === 'string' ? name : `Step ${i + 1}`;
    });

    // Create test run in Applause
    const { runId } = await applause.startTestRun(testNames);

    // Start each test case as IN_PROGRESS
    const testResultIds: number[] = [];
    for (const testName of testNames) {
      const { testResultId } = await applause.startTestCase(runId, testName);
      testResultIds.push(testResultId);
    }

    // Update cycle with Applause run info
    await prisma.testCycle.update({
      where: { id: cycleId },
      data: {
        status: 'escalated_to_applause',
        description: (cycle.description || '') +
          `\n\n[Escalated to Applause: ${new Date().toISOString()}] runId=${runId} testResultIds=${JSON.stringify(testResultIds)} Reason: ${reason || 'Human verification needed'}`
      }
    });

    return NextResponse.json({
      success: true,
      runId,
      testResultIds,
      message: 'Test run created in Applause with all test cases IN_PROGRESS',
      estimatedTurnaround: '2-4 hours',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
