import { pgTable, text, serial, integer, boolean, timestamp, date, numeric, jsonb, varchar, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users as authUsers } from "./models/auth";
import { relations } from "drizzle-orm";

// Re-export auth models
export * from "./models/auth";

// --- Enums ---
export const RATE_TYPES = ["junior", "senior"] as const;
export const INVOICE_STATUSES = ["draft", "sent", "paid", "void"] as const;
export const invoiceStatusEnum = pgEnum("invoice_status", INVOICE_STATUSES);

// --- Tables ---

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => authUsers.id),
  name: text("name").notNull(),
  email: text("email"),
  billingEmail: text("billing_email"),
  address: text("address"),
  phone: text("phone"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const workSessions = pgTable("work_sessions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => authUsers.id),
  clientId: integer("client_id").references(() => clients.id),
  date: date("date").notNull(), // stored as YYYY-MM-DD string
  startTime: text("start_time").notNull(), // HH:MM
  endTime: text("end_time").notNull(), // HH:MM
  durationMinutes: integer("duration_minutes").notNull(),
  rateType: text("rate_type", { enum: RATE_TYPES }).notNull(),
  hourlyRate: numeric("hourly_rate").notNull(), // Snapshot of rate at time of session
  notes: text("notes"),
  invoiceId: integer("invoice_id"), // Linked when invoiced
  createdAt: timestamp("created_at").defaultNow(),
});

export const DEFAULT_EMAIL_SUBJECT = "Invoice {invoice_number} from {business_name}";
export const DEFAULT_EMAIL_BODY = `Dear {client_name},

Please find attached Invoice {invoice_number} for ${"{invoice_amount}"}.

Invoice Details:
- Invoice Number: {invoice_number}
- Issue Date: {invoice_date}
- Due Date: {due_date}
- Amount: {invoice_amount}

Thank you for your business.

Best regards,
{business_name}`;

export const invoiceSettings = pgTable("invoice_settings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique().references(() => authUsers.id),
  invoicePrefix: text("invoice_prefix").default("INV-"),
  nextInvoiceNumber: integer("next_invoice_number").default(1),
  defaultJuniorRate: numeric("default_junior_rate").default("25.00"),
  defaultSeniorRate: numeric("default_senior_rate").default("30.00"),
  businessName: text("business_name"),
  businessAddress: text("business_address"),
  businessEmail: text("business_email"),
  logoUrl: text("logo_url"),
  abn: text("abn"),
  accountName: text("account_name"),
  bsb: text("bsb"),
  accountNumber: text("account_number"),
  paymentMethod: text("payment_method").default("Bank Transfer"),
  fortnightAnchorDate: date("fortnight_anchor_date"), // Reference date for fortnight calc
  templateConfig: jsonb("template_config"), // Store layout positions/settings
  emailSubjectTemplate: text("email_subject_template"),
  emailBodyTemplate: text("email_body_template"),
  // Null until the first-run setup wizard is completed. Drives whether the
  // app shows the wizard or the dashboard.
  onboardedAt: timestamp("onboarded_at"),
  // Lets the user dismiss the getting-started checklist independently.
  tourCompletedAt: timestamp("tour_completed_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => authUsers.id),
  clientId: integer("client_id").references(() => clients.id),
  invoiceNumber: text("invoice_number").notNull(),
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date").notNull(),
  status: text("status", { enum: INVOICE_STATUSES }).default("draft"),
  subtotal: numeric("subtotal").notNull(),
  discountAmount: numeric("discount_amount").default("0"),
  taxRate: numeric("tax_rate").default("0"),
  taxAmount: numeric("tax_amount").default("0"),
  total: numeric("total").notNull(),
  notes: text("notes"),
  sentAt: timestamp("sent_at"),
  sentToEmail: text("sent_to_email"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const invoiceLineItems = pgTable("invoice_line_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id),
  workSessionId: integer("work_session_id").references(() => workSessions.id),
  description: text("description").notNull(),
  quantity: numeric("quantity").notNull(), // Hours
  unitPrice: numeric("unit_price").notNull(),
  amount: numeric("amount").notNull(),
});

export const TEMPLATE_TYPES = ["standard", "custom"] as const;
export const GROUPING_MODES = ["none", "day", "rate_type", "condensed"] as const;
export const QUANTITY_MODES = ["hours", "sessions"] as const;
export const DISCOUNT_TYPES = ["percent", "fixed"] as const;

export const invoiceTemplates = pgTable("invoice_templates", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => authUsers.id),
  name: text("name").notNull(),
  type: text("type", { enum: TEMPLATE_TYPES }).notNull().default("standard"),
  uploadedFileUrl: text("uploaded_file_url"),
  fieldMappings: jsonb("field_mappings"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const goals = pgTable("goals", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => authUsers.id),
  title: text("title").notNull(),
  targetAmountCents: integer("target_amount_cents").notNull(),
  startDate: date("start_date").notNull(),
  weeklySavingsCents: integer("weekly_savings_cents").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// --- Relations ---

export const clientsRelations = relations(clients, ({ one, many }) => ({
  user: one(authUsers, {
    fields: [clients.userId],
    references: [authUsers.id],
  }),
  sessions: many(workSessions),
  invoices: many(invoices),
}));

export const workSessionsRelations = relations(workSessions, ({ one }) => ({
  user: one(authUsers, {
    fields: [workSessions.userId],
    references: [authUsers.id],
  }),
  client: one(clients, {
    fields: [workSessions.clientId],
    references: [clients.id],
  }),
  invoice: one(invoices, {
    fields: [workSessions.invoiceId],
    references: [invoices.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  client: one(clients, {
    fields: [invoices.clientId],
    references: [clients.id],
  }),
  items: many(invoiceLineItems),
}));

export const invoiceLineItemsRelations = relations(invoiceLineItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceLineItems.invoiceId],
    references: [invoices.id],
  }),
  session: one(workSessions, {
    fields: [invoiceLineItems.workSessionId],
    references: [workSessions.id],
  }),
}));

// --- Schemas ---

export const insertClientSchema = createInsertSchema(clients).omit({ id: true, userId: true, createdAt: true });
export const insertWorkSessionSchema = createInsertSchema(workSessions).omit({ id: true, userId: true, createdAt: true, invoiceId: true });
export const insertInvoiceSettingsSchema = createInsertSchema(invoiceSettings).omit({ id: true, userId: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, userId: true, createdAt: true });
export const insertGoalSchema = createInsertSchema(goals).omit({ id: true, userId: true, createdAt: true, updatedAt: true });
export const insertInvoiceTemplateSchema = createInsertSchema(invoiceTemplates).omit({ id: true, userId: true, createdAt: true });

// --- Types ---

export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;

export type WorkSession = typeof workSessions.$inferSelect;
export type InsertWorkSession = z.infer<typeof insertWorkSessionSchema>;

export type InvoiceSettings = typeof invoiceSettings.$inferSelect;
export type InsertInvoiceSettings = z.infer<typeof insertInvoiceSettingsSchema>;

export type Invoice = typeof invoices.$inferSelect;
export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;

export type Goal = typeof goals.$inferSelect;
export type InsertGoal = z.infer<typeof insertGoalSchema>;

export type InvoiceTemplate = typeof invoiceTemplates.$inferSelect;
export type InsertInvoiceTemplate = z.infer<typeof insertInvoiceTemplateSchema>;

export type FieldMapping = {
  id: string;
  fieldType: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontWeight: string;
  textAlign: string;
};

export type FieldMappings = {
  fields: FieldMapping[];
  tableArea?: { x: number; y: number; width: number; height: number };
  pageWidth: number;
  pageHeight: number;
};
