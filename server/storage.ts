import { db } from "./db";
import {
  users, clients, workSessions, invoices, invoiceSettings, invoiceLineItems,
  type Client, type InsertClient,
  type WorkSession, type InsertWorkSession,
  type InvoiceSettings, type InsertInvoiceSettings,
  type Invoice, type InvoiceLineItem,
  RATE_TYPES
} from "@shared/schema";
import { eq, and, desc, gte, lte, sql, inArray } from "drizzle-orm";

export interface IStorage {
  // Clients
  getClients(userId: string): Promise<Client[]>;
  getClient(id: number): Promise<Client | undefined>;
  createClient(client: InsertClient & { userId: string }): Promise<Client>;
  updateClient(id: number, userId: string, updates: Partial<InsertClient>): Promise<Client>;
  deleteClient(id: number, userId: string): Promise<void>;

  // Work Sessions
  getSessions(userId: string, startDate?: string, endDate?: string, clientId?: number): Promise<(WorkSession & { client: Client | null })[]>;
  createSession(session: InsertWorkSession & { userId: string }): Promise<WorkSession>;
  updateSession(id: number, userId: string, updates: Partial<InsertWorkSession>): Promise<WorkSession>;
  deleteSession(id: number, userId: string): Promise<void>;
  
  // Settings
  getSettings(userId: string): Promise<InvoiceSettings | undefined>;
  upsertSettings(userId: string, settings: Partial<InsertInvoiceSettings>): Promise<InvoiceSettings>;

  // Invoices
  getInvoices(userId: string): Promise<(Invoice & { client: Client | null })[]>;
  getInvoice(id: number): Promise<(Invoice & { client: Client | null, items: InvoiceLineItem[] }) | undefined>;
  createInvoice(
    userId: string, 
    data: { 
      clientId: number; 
      issueDate: string; 
      dueDate: string; 
      items: { description: string; quantity: string; unitPrice: string; amount: string; workSessionIds?: number[] }[];
      notes?: string;
      taxRate?: number;
      taxAmount?: number;
      discountAmount?: number;
    }
  ): Promise<Invoice>;
}

export class DatabaseStorage implements IStorage {
  // Clients
  async getClients(userId: string): Promise<Client[]> {
    return await db.select().from(clients).where(eq(clients.userId, userId));
  }

  async getClient(id: number): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    return client;
  }

  async createClient(client: InsertClient & { userId: string }): Promise<Client> {
    const [newClient] = await db.insert(clients).values(client).returning();
    return newClient;
  }

  async updateClient(id: number, userId: string, updates: Partial<InsertClient>): Promise<Client> {
    const [updated] = await db
      .update(clients)
      .set(updates)
      .where(and(eq(clients.id, id), eq(clients.userId, userId)))
      .returning();
    return updated;
  }

  async deleteClient(id: number, userId: string): Promise<void> {
    await db.delete(clients).where(and(eq(clients.id, id), eq(clients.userId, userId)));
  }

  // Work Sessions
  async getSessions(userId: string, startDate?: string, endDate?: string, clientId?: number): Promise<(WorkSession & { client: Client | null })[]> {
    const conditions = [eq(workSessions.userId, userId)];
    
    if (startDate) conditions.push(gte(workSessions.date, startDate));
    if (endDate) conditions.push(lte(workSessions.date, endDate));
    if (clientId) conditions.push(eq(workSessions.clientId, clientId));

    return await db.query.workSessions.findMany({
      where: and(...conditions),
      with: { client: true },
      orderBy: [desc(workSessions.date), desc(workSessions.startTime)]
    });
  }

  async createSession(session: InsertWorkSession & { userId: string }): Promise<WorkSession> {
    const [newSession] = await db.insert(workSessions).values(session).returning();
    return newSession;
  }

  async updateSession(id: number, userId: string, updates: Partial<InsertWorkSession>): Promise<WorkSession> {
    const [updated] = await db
      .update(workSessions)
      .set(updates)
      .where(and(eq(workSessions.id, id), eq(workSessions.userId, userId)))
      .returning();
    return updated;
  }

  async deleteSession(id: number, userId: string): Promise<void> {
    await db.delete(workSessions).where(and(eq(workSessions.id, id), eq(workSessions.userId, userId)));
  }

  // Settings
  async getSettings(userId: string): Promise<InvoiceSettings | undefined> {
    const [settings] = await db.select().from(invoiceSettings).where(eq(invoiceSettings.userId, userId));
    return settings;
  }

  async upsertSettings(userId: string, updates: Partial<InsertInvoiceSettings>): Promise<InvoiceSettings> {
    // If updates is empty, we still need to set at least one column (userId)
    // or use a dummy set for onConflictDoUpdate to work if we want to ensure it exists
    const [settings] = await db
      .insert(invoiceSettings)
      .values({ userId, ...updates })
      .onConflictDoUpdate({
        target: invoiceSettings.userId,
        set: Object.keys(updates).length > 0 ? updates : { updatedAt: new Date() } // Placeholder if no updates
      })
      .returning();
    return settings;
  }

  // Invoices
  async getInvoices(userId: string): Promise<(Invoice & { client: Client | null })[]> {
    return await db.query.invoices.findMany({
      where: eq(invoices.userId, userId),
      with: { client: true },
      orderBy: [desc(invoices.issueDate)]
    });
  }

  async getInvoice(id: number): Promise<(Invoice & { client: Client | null, items: InvoiceLineItem[] }) | undefined> {
    return await db.query.invoices.findFirst({
      where: eq(invoices.id, id),
      with: { 
        client: true,
        items: true
      }
    });
  }

  async createInvoice(
    userId: string, 
    data: { 
      clientId: number; 
      issueDate: string; 
      dueDate: string; 
      items: { description: string; quantity: string; unitPrice: string; amount: string; workSessionIds?: number[] }[];
      notes?: string;
      taxRate?: number;
      taxAmount?: number;
      discountAmount?: number;
    }
  ): Promise<Invoice> {
    let settings = await this.getSettings(userId);
    if (!settings) {
      settings = await this.upsertSettings(userId, {});
    }

    const invoiceNumber = `${settings.invoicePrefix}${String(settings.nextInvoiceNumber).padStart(4, '0')}`;
    
    const subtotal = data.items.reduce((sum, item) => sum + parseFloat(item.amount), 0);
    const taxAmt = data.taxAmount || 0;
    const discountAmt = data.discountAmount || 0;
    const total = subtotal - discountAmt + taxAmt;

    // Transaction
    return await db.transaction(async (tx) => {
      // Create Invoice
      const [newInvoice] = await tx.insert(invoices).values({
        userId,
        clientId: data.clientId,
        invoiceNumber,
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        subtotal: subtotal.toString(),
        discountAmount: discountAmt.toString(),
        taxRate: (data.taxRate || 0).toString(),
        taxAmount: taxAmt.toString(),
        total: total.toString(),
        notes: data.notes,
        status: "draft"
      }).returning();

      // Create Line Items
      for (const item of data.items) {
        const [newLineItem] = await tx.insert(invoiceLineItems).values({
          invoiceId: newInvoice.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.amount
        }).returning();

        // Link sessions if any
        if (item.workSessionIds && item.workSessionIds.length > 0) {
           await tx.update(workSessions)
             .set({ invoiceId: newInvoice.id })
             .where(inArray(workSessions.id, item.workSessionIds));
           
           // Also update the line item to link to the first session? 
           // Our schema has `workSessionId` on line item (singular). 
           // If we grouped multiple sessions into one line, we can't link 1-to-1 easily in that direction.
           // But we LINKED the sessions to the invoice above, which is what matters for "billed" status.
           
           // If it's a 1-to-1 mapping (groupByDay=false, detailed), we can set workSessionId
           if (item.workSessionIds.length === 1) {
             await tx.update(invoiceLineItems)
               .set({ workSessionId: item.workSessionIds[0] })
               .where(eq(invoiceLineItems.id, newLineItem.id));
           }
        }
      }

      // Increment invoice number
      await tx.update(invoiceSettings)
        .set({ nextInvoiceNumber: (settings!.nextInvoiceNumber || 0) + 1 })
        .where(eq(invoiceSettings.userId, userId));

      return newInvoice;
    });
  }
}

export const storage = new DatabaseStorage();
