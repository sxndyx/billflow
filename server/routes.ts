import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./auth";
import { api } from "@shared/routes";
import { z } from "zod";
import { db } from "./db";
import { invoices, invoiceLineItems, workSessions, clients, goals, invoiceTemplates, INVOICE_STATUSES, DEFAULT_EMAIL_SUBJECT, DEFAULT_EMAIL_BODY } from "@shared/schema";
import { eq, and, gte, lte, isNull, sql } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from "express";
import { subDays, format, parseISO, startOfDay, endOfDay, startOfWeek, addDays } from "date-fns";
import { getGmailStatus, sendInvoiceEmail } from "./gmail";
import { generateInvoicePDF } from "./pdf-generator";

function replaceEmailPlaceholders(
  template: string,
  data: {
    business_name?: string;
    client_name?: string;
    client_email?: string;
    invoice_number?: string;
    invoice_amount?: string;
    invoice_date?: string;
    due_date?: string;
    start_date?: string;
    end_date?: string;
    abn?: string;
    phone?: string;
  }
): string {
  let result = template;
  const placeholders: Record<string, string> = {
    '{business_name}': data.business_name || '',
    '{client_name}': data.client_name || '',
    '{client_email}': data.client_email || '',
    '{invoice_number}': data.invoice_number || '',
    '{invoice_amount}': data.invoice_amount || '',
    '{invoice_date}': data.invoice_date || '',
    '{due_date}': data.due_date || '',
    '{start_date}': data.start_date || '',
    '{end_date}': data.end_date || '',
    '{abn}': data.abn || '',
    '{phone}': data.phone || '',
  };
  
  for (const [placeholder, value] of Object.entries(placeholders)) {
    result = result.split(placeholder).join(value);
  }
  
  return result;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth setup
  await setupAuth(app);
  registerAuthRoutes(app);

  // Protected middleware for all API routes below
  const protectedApi = async (req: any, res: any, next: any) => {
    if (req.path.startsWith("/auth")) return next(); // Skip auth routes (mount-relative path)
    
    // Check auth
    const authResult = await new Promise((resolve) => {
        isAuthenticated(req, res, (err: any) => resolve(err ? false : true));
    });

    if (authResult === false) return; // Response handled by isAuthenticated

    next();
  };
  
  app.use("/api", protectedApi);

  // Clients
  app.get(api.clients.list.path, async (req: any, res) => {
    const clients = await storage.getClients(req.user.claims.sub);
    res.json(clients);
  });

  app.post(api.clients.create.path, async (req: any, res) => {
    try {
      const input = api.clients.create.input.parse(req.body);
      const client = await storage.createClient({ ...input, userId: req.user.claims.sub });
      res.status(201).json(client);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
        return;
      }
      throw err;
    }
  });

  app.put(api.clients.update.path, async (req: any, res) => {
    try {
      const input = api.clients.update.input.parse(req.body);
      const client = await storage.updateClient(parseInt(req.params.id), req.user.claims.sub, input);
      res.json(client);
    } catch (err) {
       res.status(400).json({ message: "Invalid input" });
    }
  });

  app.delete(api.clients.delete.path, async (req: any, res) => {
    await storage.deleteClient(parseInt(req.params.id), req.user.claims.sub);
    res.status(204).send();
  });

  // Sessions
  app.get(api.sessions.list.path, async (req: any, res) => {
    const { startDate, endDate, clientId } = req.query;
    const sessions = await storage.getSessions(
      req.user.claims.sub, 
      startDate as string, 
      endDate as string, 
      clientId ? parseInt(clientId as string) : undefined
    );
    res.json(sessions);
  });

  app.post(api.sessions.create.path, async (req: any, res) => {
    try {
      const input = api.sessions.create.input.parse(req.body);
      const session = await storage.createSession({ ...input, userId: req.user.claims.sub });
      res.status(201).json(session);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
        return;
      }
      throw err;
    }
  });

  app.put(api.sessions.update.path, async (req: any, res) => {
     try {
      const input = api.sessions.update.input.parse(req.body);
      const session = await storage.updateSession(parseInt(req.params.id), req.user.claims.sub, input);
      res.json(session);
    } catch (err) {
       res.status(400).json({ message: "Invalid input" });
    }
  });

  app.delete(api.sessions.delete.path, async (req: any, res) => {
    await storage.deleteSession(parseInt(req.params.id), req.user.claims.sub);
    res.status(204).send();
  });

  app.get(api.sessions.stats.path, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const sessions = await storage.getSessions(userId);
    
    const unbilledTotal = sessions
      .filter(s => !s.invoiceId)
      .reduce((sum, s) => sum + (parseFloat(s.hourlyRate) * (s.durationMinutes / 60)), 0);

    res.json({
      currentFortnightTotal: 0,
      lastFortnightTotal: 0,
      unbilledTotal: parseFloat(unbilledTotal.toFixed(2))
    });
  });

  // Copy last week's sessions to current/target week
  app.post(api.sessions.copyLastWeek.path, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const input = api.sessions.copyLastWeek.input?.parse(req.body) || {};
      
      // Calculate target week start (Sunday) - default to current week
      const now = new Date();
      let targetWeekStart: Date;
      if (input.targetWeekStart) {
        targetWeekStart = parseISO(input.targetWeekStart);
      } else {
        targetWeekStart = startOfWeek(now, { weekStartsOn: 0 }); // Sunday
      }
      
      // Previous week start (Sunday before target)
      const prevWeekStart = addDays(targetWeekStart, -7);
      const prevWeekEnd = addDays(prevWeekStart, 6); // Saturday
      
      const prevStartStr = format(prevWeekStart, "yyyy-MM-dd");
      const prevEndStr = format(prevWeekEnd, "yyyy-MM-dd");
      
      // Get sessions from previous week
      const prevSessions = await storage.getSessions(userId, prevStartStr, prevEndStr);
      
      // Get existing sessions in target week for collision detection
      const targetWeekEnd = addDays(targetWeekStart, 6);
      const targetStartStr = format(targetWeekStart, "yyyy-MM-dd");
      const targetEndStr = format(targetWeekEnd, "yyyy-MM-dd");
      const existingSessions = await storage.getSessions(userId, targetStartStr, targetEndStr);
      
      // Create a set of existing session keys for collision detection
      const existingKeys = new Set(
        existingSessions.map(s => `${s.date}|${s.startTime}|${s.clientId || ''}`)
      );
      
      let createdCount = 0;
      let skippedCount = 0;
      
      for (const session of prevSessions) {
        // Calculate new date (+7 days)
        const oldDate = parseISO(session.date);
        const newDate = addDays(oldDate, 7);
        const newDateStr = format(newDate, "yyyy-MM-dd");
        
        // Check for collision
        const key = `${newDateStr}|${session.startTime}|${session.clientId || ''}`;
        if (existingKeys.has(key)) {
          skippedCount++;
          continue;
        }
        
        // Create new session
        await storage.createSession({
          userId,
          date: newDateStr,
          startTime: session.startTime,
          endTime: session.endTime,
          durationMinutes: session.durationMinutes,
          rateType: session.rateType as "junior" | "senior",
          clientId: session.clientId ?? undefined,
          notes: session.notes ?? undefined,
          hourlyRate: session.hourlyRate,
        });
        
        createdCount++;
        existingKeys.add(key); // Prevent duplicates within same copy operation
      }
      
      res.json({ createdCount, skippedCount });
    } catch (err: any) {
      console.error("Copy last week error:", err);
      res.status(400).json({ message: err.message || "Failed to copy sessions" });
    }
  });

  // Dashboard analytics - based on timesheet sessions (hours * rate)
  app.get(api.dashboard.stats.path, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const period = (req.query.period as string) || "14d";
    
    const days = parseInt(period.replace("d", ""));
    const now = new Date();
    
    // For 7D, align to Sunday-Saturday week containing today
    let startDate: string;
    let endDate: string;
    
    if (period === "7d") {
      // Get current week's Sunday start
      const weekStart = startOfWeek(now, { weekStartsOn: 0 }); // Sunday
      const weekEnd = addDays(weekStart, 6); // Saturday
      startDate = format(weekStart, "yyyy-MM-dd");
      endDate = format(weekEnd, "yyyy-MM-dd");
    } else {
      startDate = format(subDays(now, days - 1), "yyyy-MM-dd");
      endDate = format(now, "yyyy-MM-dd");
    }
    
    const prevStartDate = format(subDays(parseISO(startDate), days), "yyyy-MM-dd");
    const prevEndDate = format(subDays(parseISO(startDate), 1), "yyyy-MM-dd");

    // Get sessions for current period
    const currentSessions = await storage.getSessions(userId, startDate, endDate);
    
    // Calculate earnings from sessions (hours * rate)
    const earnings = currentSessions.reduce((sum, s) => {
      const hours = s.durationMinutes / 60;
      const rate = parseFloat(s.hourlyRate);
      return sum + (hours * rate);
    }, 0);

    // Previous period for comparison
    const prevSessions = await storage.getSessions(userId, prevStartDate, prevEndDate);
    const previousEarnings = prevSessions.reduce((sum, s) => {
      const hours = s.durationMinutes / 60;
      const rate = parseFloat(s.hourlyRate);
      return sum + (hours * rate);
    }, 0);

    // Unbilled sessions (not linked to any invoice)
    const unbilled = currentSessions
      .filter(s => !s.invoiceId)
      .reduce((sum, s) => sum + (parseFloat(s.hourlyRate) * (s.durationMinutes / 60)), 0);

    // Chart data - daily earnings from sessions
    const chartData: { date: string; earnings: number }[] = [];
    
    // Generate date range
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    for (let i = 0; i < diffDays; i++) {
      const date = format(addDays(start, i), "yyyy-MM-dd");
      const dayTotal = currentSessions
        .filter(s => s.date === date)
        .reduce((sum, s) => {
          const hours = s.durationMinutes / 60;
          const rate = parseFloat(s.hourlyRate);
          return sum + (hours * rate);
        }, 0);
      chartData.push({ date, earnings: parseFloat(dayTotal.toFixed(2)) });
    }

    res.json({
      earnings: parseFloat(earnings.toFixed(2)),
      unbilled: parseFloat(unbilled.toFixed(2)),
      previousEarnings: parseFloat(previousEarnings.toFixed(2)),
      chartData
    });
  });

  app.post(api.dashboard.reset.path, async (req: any, res) => {
    // No computed aggregates to clear - data is computed on-the-fly
    res.json({ message: "Analytics cache cleared" });
  });

  // Analytics - flexible date range earnings
  app.get(api.analytics.earnings.path, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { start, end, bucket = "daily" } = req.query;
      
      if (!start || !end) {
        return res.status(400).json({ message: "start and end dates are required" });
      }

      const startDate = start as string;
      const endDate = end as string;
      
      // Validate date format and order
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD" });
      }
      
      // Calculate period length for previous period
      const startParsed = parseISO(startDate);
      const endParsed = parseISO(endDate);
      
      if (isNaN(startParsed.getTime()) || isNaN(endParsed.getTime())) {
        return res.status(400).json({ message: "Invalid date values" });
      }
      
      if (startParsed > endParsed) {
        return res.status(400).json({ message: "start date must be before or equal to end date" });
      }
      const periodDays = Math.ceil((endParsed.getTime() - startParsed.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
      const prevEnd = format(subDays(startParsed, 1), "yyyy-MM-dd");
      const prevStart = format(subDays(startParsed, periodDays), "yyyy-MM-dd");

      // Get sessions for current period
      const currentSessions = await storage.getSessions(userId, startDate, endDate);
      
      // Calculate total earnings
      const total = currentSessions.reduce((sum, s) => {
        const hours = s.durationMinutes / 60;
        const rate = parseFloat(s.hourlyRate);
        return sum + (hours * rate);
      }, 0);

      // Previous period
      const prevSessions = await storage.getSessions(userId, prevStart, prevEnd);
      const previousTotal = prevSessions.reduce((sum, s) => {
        const hours = s.durationMinutes / 60;
        const rate = parseFloat(s.hourlyRate);
        return sum + (hours * rate);
      }, 0);

      // Build series - daily or weekly buckets
      const series: { date: string; amount: number }[] = [];
      
      if (bucket === "weekly" || periodDays > 120) {
        // Weekly aggregation (Sunday start) - clamp to requested range
        let weekStart = startOfWeek(startParsed, { weekStartsOn: 0 });
        if (weekStart < startParsed) weekStart = startParsed; // clamp to start
        
        while (weekStart <= endParsed) {
          const weekEnd = addDays(startOfWeek(weekStart, { weekStartsOn: 0 }), 6);
          const clampedEnd = weekEnd > endParsed ? endParsed : weekEnd;
          
          const weekEarnings = currentSessions
            .filter(s => {
              const d = parseISO(s.date);
              return d >= weekStart && d <= clampedEnd;
            })
            .reduce((sum, s) => sum + (parseFloat(s.hourlyRate) * (s.durationMinutes / 60)), 0);
          
          series.push({
            date: format(weekStart, "yyyy-MM-dd"),
            amount: parseFloat(weekEarnings.toFixed(2))
          });
          weekStart = addDays(startOfWeek(weekStart, { weekStartsOn: 0 }), 7);
        }
      } else {
        // Daily aggregation
        for (let i = 0; i < periodDays; i++) {
          const date = format(addDays(startParsed, i), "yyyy-MM-dd");
          const dayTotal = currentSessions
            .filter(s => s.date === date)
            .reduce((sum, s) => sum + (parseFloat(s.hourlyRate) * (s.durationMinutes / 60)), 0);
          
          series.push({
            date,
            amount: parseFloat(dayTotal.toFixed(2))
          });
        }
      }

      res.json({
        series,
        total: parseFloat(total.toFixed(2)),
        previousTotal: parseFloat(previousTotal.toFixed(2)),
        prevStart,
        prevEnd
      });
    } catch (err) {
      console.error('Analytics earnings error:', err);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // Goals CRUD
  app.get(api.goals.list.path, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userGoals = await db.select().from(goals).where(eq(goals.userId, userId));
      res.json(userGoals);
    } catch (err) {
      console.error('Get goals error:', err);
      res.status(500).json({ message: "Failed to fetch goals" });
    }
  });

  app.post(api.goals.create.path, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const input = api.goals.create.input.parse(req.body);
      const [goal] = await db.insert(goals).values({
        ...input,
        userId
      }).returning();
      res.status(201).json(goal);
    } catch (err) {
      console.error('Create goal error:', err);
      res.status(400).json({ message: "Failed to create goal" });
    }
  });

  app.put("/api/goals/:id", async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      
      const userId = req.user.claims.sub;
      const input = api.goals.update.input.parse(req.body);

      // Verify goal belongs to user
      const [existing] = await db.select().from(goals).where(and(eq(goals.id, id), eq(goals.userId, userId)));
      if (!existing) return res.status(404).json({ message: "Goal not found" });

      const [updated] = await db.update(goals)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(goals.id, id))
        .returning();
      
      res.json(updated);
    } catch (err) {
      console.error('Update goal error:', err);
      res.status(400).json({ message: "Failed to update goal" });
    }
  });

  app.delete("/api/goals/:id", async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      
      const userId = req.user.claims.sub;

      // Verify goal belongs to user
      const [existing] = await db.select().from(goals).where(and(eq(goals.id, id), eq(goals.userId, userId)));
      if (!existing) return res.status(404).json({ message: "Goal not found" });

      await db.delete(goals).where(eq(goals.id, id));
      res.status(204).send();
    } catch (err) {
      console.error('Delete goal error:', err);
      res.status(400).json({ message: "Failed to delete goal" });
    }
  });

  // Settings
  app.get(api.settings.get.path, async (req: any, res) => {
    let settings = await storage.getSettings(req.user.claims.sub);
    if (!settings) {
      settings = await storage.upsertSettings(req.user.claims.sub, {});
    }
    res.json(settings);
  });

  app.put(api.settings.update.path, async (req: any, res) => {
    const input = api.settings.update.input.parse(req.body);
    const settings = await storage.upsertSettings(req.user.claims.sub, input);
    res.json(settings);
  });

  // --- First-run setup ----------------------------------------------------
  // A fresh install has no business details, no rates and no clients, so the
  // client shows a wizard instead of an empty dashboard until this completes.
  const onboardingInput = z.object({
    businessName: z.string().trim().min(1, "Business name is required"),
    businessEmail: z.string().trim().email("Enter a valid email").or(z.literal("")).optional(),
    businessAddress: z.string().trim().optional(),
    abn: z.string().trim().optional(),
    accountName: z.string().trim().optional(),
    bsb: z.string().trim().optional(),
    accountNumber: z.string().trim().optional(),
    paymentMethod: z.string().trim().optional(),
    defaultJuniorRate: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter a rate like 30 or 30.00"),
    defaultSeniorRate: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter a rate like 35 or 35.00"),
    invoicePrefix: z.string().trim().max(10).optional(),
    nextInvoiceNumber: z.number().int().min(1).optional(),
    firstClient: z
      .object({
        name: z.string().trim().min(1),
        billingEmail: z.string().trim().email("Enter a valid email").or(z.literal("")).optional(),
        address: z.string().trim().optional(),
        phone: z.string().trim().optional(),
      })
      .optional(),
  });

  app.get("/api/onboarding/status", async (req: any, res) => {
    const userId = req.user.claims.sub;
    const settings = await storage.getSettings(userId);
    const [clientCount, sessionCount, invoiceCount] = await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(clients).where(eq(clients.userId, userId)),
      db.select({ n: sql<number>`count(*)::int` }).from(workSessions).where(eq(workSessions.userId, userId)),
      db.select({ n: sql<number>`count(*)::int` }).from(invoices).where(eq(invoices.userId, userId)),
    ]);

    res.json({
      // businessName is the upgrade path: installs that predate the wizard
      // already have their details filled in and must not be sent through it.
      onboarded: !!(settings?.onboardedAt || settings?.businessName),
      tourCompleted: !!settings?.tourCompletedAt,
      checklist: {
        hasClient: clientCount[0].n > 0,
        hasSession: sessionCount[0].n > 0,
        hasInvoice: invoiceCount[0].n > 0,
      },
    });
  });

  app.post("/api/onboarding/complete", async (req: any, res) => {
    const parsed = onboardingInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }

    const userId = req.user.claims.sub;
    const { firstClient, ...settingsInput } = parsed.data;

    try {
      await storage.upsertSettings(userId, {
        ...settingsInput,
        onboardedAt: new Date(),
      } as any);

      if (firstClient?.name) {
        const existing = await storage.getClients(userId);
        if (!existing.some((c) => c.name.toLowerCase() === firstClient.name.toLowerCase())) {
          await storage.createClient({ ...firstClient, userId });
        }
      }

      res.status(201).json(await storage.getSettings(userId));
    } catch (err) {
      console.error("Onboarding error:", err);
      res.status(500).json({ message: "Could not save your setup" });
    }
  });

  app.post("/api/onboarding/dismiss-tour", async (req: any, res) => {
    const settings = await storage.upsertSettings(req.user.claims.sub, {
      tourCompletedAt: new Date(),
    } as any);
    res.json(settings);
  });

  // Invoices
  app.get(api.invoices.list.path, async (req: any, res) => {
    const invoices = await storage.getInvoices(req.user.claims.sub);
    res.json(invoices);
  });

  app.get(api.invoices.get.path, async (req: any, res) => {
    const invoice = await storage.getInvoice(parseInt(req.params.id));
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    res.json(invoice);
  });

  app.post(api.invoices.generatePreview.path, async (req: any, res) => {
    try {
      const input = api.invoices.generatePreview.input.parse(req.body);
      const { clientId, startDate, endDate, groupingMode, quantityMode, roundingIncrement, enableGst, gstRate, discountType, discountValue, groupByDay } = input;
      const userId = req.user.claims.sub;

      const sessions = await storage.getSessions(userId, startDate, endDate, clientId);
      const unbilledSessions = sessions.filter(s => !s.invoiceId);

      const lineItems: { description: string; quantity: number; unitPrice: number; amount: number; workSessionIds: number[] }[] = [];
      const effectiveGrouping = groupingMode || (groupByDay ? "day" : "none");

      const roundQty = (hours: number, increment?: number): number => {
        if (!increment || increment <= 0) return hours;
        return Math.ceil(hours / increment) * increment;
      };

      if (effectiveGrouping === "day") {
        const byDay: Record<string, typeof unbilledSessions> = {};
        for (const s of unbilledSessions) {
          (byDay[s.date] ||= []).push(s);
        }
        for (const [date, daySessions] of Object.entries(byDay).sort()) {
          const totalMins = daySessions.reduce((sum, s) => sum + s.durationMinutes, 0);
          const avgRate = daySessions.reduce((sum, s) => sum + parseFloat(s.hourlyRate), 0) / daySessions.length;
          const qty = quantityMode === "sessions" ? daySessions.length : roundQty(totalMins / 60, roundingIncrement);
          const price = quantityMode === "sessions" ? daySessions.reduce((sum, s) => sum + (s.durationMinutes / 60) * parseFloat(s.hourlyRate), 0) / daySessions.length : avgRate;
          lineItems.push({
            description: `${date}: Work Sessions (${daySessions.length} session${daySessions.length > 1 ? 's' : ''})`,
            quantity: parseFloat(qty.toFixed(4)),
            unitPrice: parseFloat(price.toFixed(2)),
            amount: parseFloat((qty * price).toFixed(2)),
            workSessionIds: daySessions.map(s => s.id),
          });
        }
      } else if (effectiveGrouping === "rate_type") {
        const byRate: Record<string, typeof unbilledSessions> = {};
        for (const s of unbilledSessions) {
          (byRate[s.rateType] ||= []).push(s);
        }
        for (const [rateType, rateSessions] of Object.entries(byRate)) {
          const rate = parseFloat(rateSessions[0].hourlyRate);
          const totalMins = rateSessions.reduce((sum, s) => sum + s.durationMinutes, 0);
          const qty = quantityMode === "sessions" ? rateSessions.length : roundQty(totalMins / 60, roundingIncrement);
          const price = quantityMode === "sessions" ? rateSessions.reduce((sum, s) => sum + (s.durationMinutes / 60) * parseFloat(s.hourlyRate), 0) / rateSessions.length : rate;
          lineItems.push({
            description: `${rateType.charAt(0).toUpperCase() + rateType.slice(1)} Rate Work`,
            quantity: parseFloat(qty.toFixed(4)),
            unitPrice: parseFloat(price.toFixed(2)),
            amount: parseFloat((qty * price).toFixed(2)),
            workSessionIds: rateSessions.map(s => s.id),
          });
        }
      } else if (effectiveGrouping === "condensed") {
        const totalMins = unbilledSessions.reduce((sum, s) => sum + s.durationMinutes, 0);
        const avgRate = unbilledSessions.length > 0 ? unbilledSessions.reduce((sum, s) => sum + parseFloat(s.hourlyRate), 0) / unbilledSessions.length : 0;
        const qty = quantityMode === "sessions" ? unbilledSessions.length : roundQty(totalMins / 60, roundingIncrement);
        const price = quantityMode === "sessions" ? (unbilledSessions.length > 0 ? unbilledSessions.reduce((sum, s) => sum + (s.durationMinutes / 60) * parseFloat(s.hourlyRate), 0) / unbilledSessions.length : 0) : avgRate;
        if (unbilledSessions.length > 0) {
          lineItems.push({
            description: `Consulting Services (${startDate} to ${endDate})`,
            quantity: parseFloat(qty.toFixed(4)),
            unitPrice: parseFloat(price.toFixed(2)),
            amount: parseFloat((qty * price).toFixed(2)),
            workSessionIds: unbilledSessions.map(s => s.id),
          });
        }
      } else {
        for (const session of unbilledSessions) {
          const hrs = session.durationMinutes / 60;
          const rate = parseFloat(session.hourlyRate);
          const qty = quantityMode === "sessions" ? 1 : roundQty(hrs, roundingIncrement);
          const price = quantityMode === "sessions" ? hrs * rate : rate;
          lineItems.push({
            description: `${session.date} (${session.startTime}-${session.endTime}): ${session.notes || 'Work Session'}`,
            quantity: parseFloat(qty.toFixed(4)),
            unitPrice: parseFloat(price.toFixed(2)),
            amount: parseFloat((qty * price).toFixed(2)),
            workSessionIds: [session.id],
          });
        }
      }

      const subtotalCents = Math.round(lineItems.reduce((sum, item) => sum + item.amount, 0) * 100);
      let discountCents = 0;
      if (discountType && discountValue && discountValue > 0) {
        discountCents = discountType === "percent"
          ? Math.round(subtotalCents * discountValue / 100)
          : Math.round(discountValue * 100);
      }
      const afterDiscountCents = subtotalCents - discountCents;
      const taxCents = enableGst ? Math.round(afterDiscountCents * (gstRate || 10) / 100) : 0;
      const totalCents = afterDiscountCents + taxCents;

      res.json({
        lineItems,
        subtotalCents,
        discountCents,
        taxCents,
        totalCents,
        subtotal: subtotalCents / 100,
        total: totalCents / 100,
      });
    } catch (err: any) {
      console.error('Preview error:', err);
      res.status(400).json({ message: err.message || "Failed to generate preview" });
    }
  });

  app.post(api.invoices.create.path, async (req: any, res) => {
    try {
      const input = api.invoices.create.input.parse(req.body);
      const invoice = await storage.createInvoice(req.user.claims.sub, {
          clientId: input.clientId,
          issueDate: input.issueDate,
          dueDate: input.dueDate,
          items: input.items.map(item => ({
              ...item,
              quantity: item.quantity.toString(),
              unitPrice: item.unitPrice.toString(),
              amount: item.amount.toString(),
              workSessionIds: item.workSessionIds || []
          })),
          notes: input.notes,
          taxRate: input.taxRate,
          taxAmount: input.taxAmount,
          discountAmount: input.discountAmount,
      });
      res.status(201).json(invoice);
    } catch (err) {
      console.error('Create invoice error:', err);
      res.status(400).json({ message: "Failed to create invoice" });
    }
  });

  app.put(api.invoices.update.path, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      
      const input = z.object({ status: z.enum(INVOICE_STATUSES) }).parse(req.body);
      const [updated] = await db
        .update(invoices)
        .set(input)
        .where(and(eq(invoices.id, id), eq(invoices.userId, req.user.claims.sub)))
        .returning();
      
      if (!updated) return res.status(404).json({ message: "Invoice not found" });
      res.json(updated);
    } catch (err) {
      console.error('Update invoice error:', err);
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.delete(api.invoices.delete.path, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      
      const userId = req.user.claims.sub;

      // Verify invoice exists and belongs to user
      const [invoice] = await db.select()
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.userId, userId)));
      
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });

      // Unlink work sessions from this invoice
      await db.update(workSessions)
        .set({ invoiceId: null })
        .where(eq(workSessions.invoiceId, id));

      // Delete line items
      await db.delete(invoiceLineItems)
        .where(eq(invoiceLineItems.invoiceId, id));

      // Delete invoice
      await db.delete(invoices)
        .where(eq(invoices.id, id));

      res.status(204).send();
    } catch (err) {
      console.error('Delete invoice error:', err);
      res.status(400).json({ message: "Failed to delete invoice" });
    }
  });

  // Update invoice number
  app.patch("/api/invoices/:id/number", async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      
      const userId = req.user.claims.sub;
      const { invoiceNumber } = req.body;

      // Validate non-empty
      const trimmed = (invoiceNumber || '').trim();
      if (!trimmed) {
        return res.status(400).json({ message: "Invoice number cannot be empty" });
      }

      // Verify invoice exists and belongs to user
      const [invoice] = await db.select()
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.userId, userId)));
      
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });

      // Check uniqueness per user (exclude current invoice)
      const [existing] = await db.select()
        .from(invoices)
        .where(and(
          eq(invoices.invoiceNumber, trimmed),
          eq(invoices.userId, userId),
          sql`${invoices.id} != ${id}`
        ));
      
      if (existing) {
        return res.status(400).json({ message: "Invoice number already exists" });
      }

      // Update
      const [updated] = await db.update(invoices)
        .set({ invoiceNumber: trimmed })
        .where(eq(invoices.id, id))
        .returning();

      res.json(updated);
    } catch (err) {
      console.error('Update invoice number error:', err);
      res.status(400).json({ message: "Failed to update invoice number" });
    }
  });

  // Gmail status
  app.get("/api/gmail/status", async (req: any, res) => {
    try {
      const status = await getGmailStatus();
      res.json(status);
    } catch (err) {
      console.error('Gmail status error:', err);
      res.json({ connected: false });
    }
  });

  // Send invoice by email
  app.post("/api/invoices/:id/send", async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      
      const userId = req.user.claims.sub;

      // Check Gmail connection
      const gmailStatus = await getGmailStatus();
      if (!gmailStatus.connected) {
        return res.status(400).json({ message: "Gmail not connected. Please connect your Google account first." });
      }

      // Get invoice with client
      const [invoice] = await db.select()
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.userId, userId)));
      
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });

      // Get client
      const [client] = await db.select()
        .from(clients)
        .where(eq(clients.id, invoice.clientId!));
      
      if (!client) return res.status(400).json({ message: "Client not found" });
      
      const billingEmail = client.billingEmail || client.email;
      if (!billingEmail) {
        return res.status(400).json({ message: "Missing billing email. Please add a billing email to the client." });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(billingEmail)) {
        return res.status(400).json({ message: "Invalid billing email format" });
      }

      // Get settings for business name and email templates
      const settings = await storage.getSettings(userId);
      const businessName = settings?.businessName || 'BillFlow';

      // Get line items with linked work sessions
      const items = await db.select()
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoiceId, id));

      // Get work session dates for start_date/end_date placeholders
      const sessionIds = items.map(item => item.workSessionId).filter(Boolean) as number[];
      let startDate = '';
      let endDate = '';
      
      if (sessionIds.length > 0) {
        const sessions = await db.select()
          .from(workSessions)
          .where(sql`${workSessions.id} IN (${sql.join(sessionIds, sql`, `)})`);
        
        if (sessions.length > 0) {
          const dates = sessions.map(s => s.date).sort();
          startDate = format(new Date(dates[0]), 'dd/MM/yyyy');
          endDate = format(new Date(dates[dates.length - 1]), 'dd/MM/yyyy');
        }
      }

      // Generate PDF using pdfkit
      const pdfBuffer = await generateInvoicePDF(invoice, client, items, settings || null);

      // Prepare email using templates
      const subjectTemplate = settings?.emailSubjectTemplate || DEFAULT_EMAIL_SUBJECT;
      const bodyTemplate = settings?.emailBodyTemplate || DEFAULT_EMAIL_BODY;
      
      const templateData = {
        business_name: businessName,
        client_name: client.name,
        client_email: client.billingEmail || client.email || '',
        invoice_number: invoice.invoiceNumber,
        invoice_amount: `$${parseFloat(invoice.total).toFixed(2)}`,
        invoice_date: format(new Date(invoice.issueDate), 'dd/MM/yyyy'),
        due_date: format(new Date(invoice.dueDate), 'dd/MM/yyyy'),
        start_date: startDate,
        end_date: endDate,
        abn: settings?.abn || '',
        phone: client.phone || '',
      };
      
      const subject = replaceEmailPlaceholders(subjectTemplate, templateData);
      const body = replaceEmailPlaceholders(bodyTemplate, templateData);

      const pdfFilename = `${invoice.invoiceNumber}.pdf`;

      // Send email
      await sendInvoiceEmail(billingEmail, subject, body, Buffer.from(pdfBuffer), pdfFilename);

      // Update invoice status
      const [updated] = await db
        .update(invoices)
        .set({ 
          status: 'sent',
          sentAt: new Date(),
          sentToEmail: billingEmail
        })
        .where(eq(invoices.id, id))
        .returning();

      res.json({ 
        message: "Invoice sent successfully",
        invoice: updated
      });
    } catch (err: any) {
      console.error('Send invoice error:', err);
      res.status(500).json({ message: err.message || "Failed to send invoice" });
    }
  });

  // --- Template routes ---
  const uploadsDir = path.join(process.cwd(), "uploads", "templates");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadsDir),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ['.png', '.jpg', '.jpeg', '.pdf', '.docx'];
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, allowed.includes(ext));
    },
  });

  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  app.post(api.templates.upload.path, upload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded or invalid file type" });
      const url = `/uploads/templates/${req.file.filename}`;
      res.json({ url });
    } catch (err) {
      console.error("Upload error:", err);
      res.status(400).json({ message: "Upload failed" });
    }
  });

  app.get(api.templates.list.path, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const templates = await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.userId, userId));
      res.json(templates);
    } catch (err) {
      console.error("List templates error:", err);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  app.post(api.templates.create.path, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { name, type, uploadedFileUrl, fieldMappings, isDefault } = req.body;
      if (isDefault) {
        await db.update(invoiceTemplates).set({ isDefault: false }).where(eq(invoiceTemplates.userId, userId));
      }
      const [template] = await db.insert(invoiceTemplates).values({
        userId, name: name || "Untitled Template", type: type || "standard",
        uploadedFileUrl, fieldMappings, isDefault: isDefault || false,
      }).returning();
      res.status(201).json(template);
    } catch (err) {
      console.error("Create template error:", err);
      res.status(400).json({ message: "Failed to create template" });
    }
  });

  app.put(api.templates.update.path, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const userId = req.user.claims.sub;
      const [existing] = await db.select().from(invoiceTemplates).where(and(eq(invoiceTemplates.id, id), eq(invoiceTemplates.userId, userId)));
      if (!existing) return res.status(404).json({ message: "Template not found" });
      const { name, fieldMappings, isDefault } = req.body;
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (fieldMappings !== undefined) updates.fieldMappings = fieldMappings;
      if (isDefault !== undefined) {
        if (isDefault) {
          await db.update(invoiceTemplates).set({ isDefault: false }).where(eq(invoiceTemplates.userId, userId));
        }
        updates.isDefault = isDefault;
      }
      const [updated] = await db.update(invoiceTemplates).set(updates).where(eq(invoiceTemplates.id, id)).returning();
      res.json(updated);
    } catch (err) {
      console.error("Update template error:", err);
      res.status(400).json({ message: "Failed to update template" });
    }
  });

  app.delete(api.templates.delete.path, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const userId = req.user.claims.sub;
      const [existing] = await db.select().from(invoiceTemplates).where(and(eq(invoiceTemplates.id, id), eq(invoiceTemplates.userId, userId)));
      if (!existing) return res.status(404).json({ message: "Template not found" });
      await db.delete(invoiceTemplates).where(eq(invoiceTemplates.id, id));
      res.status(204).send();
    } catch (err) {
      console.error("Delete template error:", err);
      res.status(400).json({ message: "Failed to delete template" });
    }
  });

  app.post(api.templates.setDefault.path, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const userId = req.user.claims.sub;
      const [existing] = await db.select().from(invoiceTemplates).where(and(eq(invoiceTemplates.id, id), eq(invoiceTemplates.userId, userId)));
      if (!existing) return res.status(404).json({ message: "Template not found" });
      await db.update(invoiceTemplates).set({ isDefault: false }).where(eq(invoiceTemplates.userId, userId));
      const [updated] = await db.update(invoiceTemplates).set({ isDefault: true }).where(eq(invoiceTemplates.id, id)).returning();
      res.json(updated);
    } catch (err) {
      console.error("Set default template error:", err);
      res.status(400).json({ message: "Failed to set default template" });
    }
  });

  return httpServer;
}
