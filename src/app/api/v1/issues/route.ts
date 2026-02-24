import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { dispatchWebhook } from "@/lib/webhook-dispatcher";
import { calculatePriorityScore, shouldBlockRelease } from "@/lib/priority-scoring";
import { evaluateEscalationRules } from "@/lib/escalation-engine";

export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get("project");
  const flow = req.nextUrl.searchParams.get("flow");
  const severity = req.nextUrl.searchParams.get("severity");
  const status = req.nextUrl.searchParams.get("status");
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "50"), 200);
  const offset = parseInt(req.nextUrl.searchParams.get("offset") || "0");

  const where: any = { isAutoReport: true };
  if (project) where.projectSlug = project;
  if (flow) where.flow = flow;
  if (severity) where.severity = severity;
  if (status) where.status = status;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  const [issues, total] = await Promise.all([
    prisma.bugReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.bugReport.count({ where }),
  ]);

  return NextResponse.json({ issues, total, limit, offset });
}

export async function POST(req: NextRequest) {
  const { user, response } = await requireAuth(req);
  if (response) return response;

  try {
    const body = await req.json();
    const { project, flow, action, error, errorCode, cid, severity, metadata } = body;

    if (!project || !flow || !error || !severity) {
      return NextResponse.json(
        { error: "Missing required fields: project, flow, error, severity" },
        { status: 400 }
      );
    }

    if (!["critical", "high", "medium", "low"].includes(severity)) {
      return NextResponse.json(
        { error: "severity must be one of: critical, high, medium, low" },
        { status: 400 }
      );
    }

    // 1. Find or create project
    let proj = await prisma.project.findUnique({ where: { slug: project } });
    if (!proj) {
      proj = await prisma.project.create({
        data: {
          name: project.charAt(0).toUpperCase() + project.slice(1),
          slug: project,
          ownerId: user!.id,
        },
      });
    }

    // 2. Find or create today's auto-report cycle
    const today = new Date().toISOString().split("T")[0];
    const cycleTitle = `${proj.name} Auto-Reports ${today}`;

    let cycle = await prisma.testCycle.findFirst({
      where: { projectId: proj.id, title: cycleTitle },
    });
    if (!cycle) {
      cycle = await prisma.testCycle.create({
        data: {
          projectId: proj.id,
          title: cycleTitle,
          description: `Automatically created for auto-reported issues on ${today}`,
          targetUrl: proj.targetUrl || "",
          priority: "high",
          status: "open",
          createdById: user!.id,
        },
      });
    }

    // 3. Deduplication: same flow + errorCode + error (first 100 chars) in last 24h
    const errorPrefix = error.substring(0, 100);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const existing = await prisma.bugReport.findFirst({
      where: {
        flow,
        errorCode: errorCode || null,
        title: { startsWith: `[${flow}] ${errorPrefix}` },
        isAutoReport: true,
        projectSlug: project,
        createdAt: { gte: twentyFourHoursAgo },
      },
    });

    if (existing) {
      // Increment occurrences and add CID
      const currentCids: string[] = JSON.parse(existing.affectedCids || "[]");
      if (cid && !currentCids.includes(String(cid))) {
        currentCids.push(String(cid));
      }

      const updated = await prisma.bugReport.update({
        where: { id: existing.id },
        data: {
          occurrences: existing.occurrences + 1,
          affectedCids: JSON.stringify(currentCids),
        },
      });

      return NextResponse.json({
        id: updated.id,
        isNew: false,
        occurrences: updated.occurrences,
        cycleId: existing.cycleId,
      });
    }

    // 4. Create new bug report
    const title = `[${flow}] ${errorPrefix}`;
    const stepsToReproduce = [
      `Flow: ${flow}`,
      action ? `Action: ${action}` : null,
      cid ? `Customer ID: ${cid}` : null,
      `Error Code: ${errorCode || "N/A"}`,
    ].filter(Boolean).join("\n");

    const actualResult = metadata
      ? `${error}\n\nMetadata:\n${JSON.stringify(metadata, null, 2)}`
      : error;

    const deviceInfoStr = JSON.stringify(metadata || {});
    const severityMap: Record<string, string> = { critical: "critical", high: "major", medium: "minor", low: "cosmetic" };
    const mappedSeverity = severityMap[severity] || "minor";
    const priorityScore = calculatePriorityScore(mappedSeverity, deviceInfoStr);
    const releaseBlocker = shouldBlockRelease(mappedSeverity);

    const affectedCids = cid ? JSON.stringify([String(cid)]) : "[]";

    const bug = await prisma.bugReport.create({
      data: {
        cycleId: cycle.id,
        reporterId: user!.id,
        title,
        severity: mappedSeverity,
        stepsToReproduce,
        expectedResult: "Flow should complete successfully",
        actualResult,
        deviceInfo: deviceInfoStr,
        priorityScore,
        releaseBlocker,
        flow,
        errorCode: errorCode || null,
        occurrences: 1,
        affectedCids,
        projectSlug: project,
        isAutoReport: true,
      },
    });

    // 5. Escalation rules
    evaluateEscalationRules({
      id: bug.id,
      cycleId: bug.cycleId,
      severity: bug.severity,
      deviceInfo: bug.deviceInfo,
      status: bug.status,
    }).catch(() => {});

    // 6. Webhook
    dispatchWebhook("bug_report.created", bug, user!.id);

    return NextResponse.json({
      id: bug.id,
      isNew: true,
      occurrences: 1,
      cycleId: cycle.id,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
