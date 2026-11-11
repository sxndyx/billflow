import { z } from "zod";
import { insertClientSchema, insertWorkSessionSchema, insertInvoiceSettingsSchema, insertGoalSchema, insertInvoiceTemplateSchema, clients, workSessions, invoices, invoiceSettings, invoiceLineItems, invoiceTemplates, goals, INVOICE_STATUSES, GROUPING_MODES, QUANTITY_MODES, DISCOUNT_TYPES } from "./schema";

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  dashboard: {
    stats: {
      method: "GET" as const,
      path: "/api/dashboard/stats",
      input: z.object({
        period: z.enum(["7d", "14d", "30d", "90d"]).optional(),
      }).optional(),
      responses: {
        200: z.object({
          earnings: z.number(),
          unbilled: z.number(),
          previousEarnings: z.number(),
          chartData: z.array(z.object({
            date: z.string(),
            earnings: z.number(),
          })),
        }),
      },
    },
    reset: {
      method: "POST" as const,
      path: "/api/dashboard/reset",
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
  },
  analytics: {
    earnings: {
      method: "GET" as const,
      path: "/api/analytics/earnings",
      input: z.object({
        start: z.string(),
        end: z.string(),
        bucket: z.enum(["daily", "weekly"]).optional(),
      }),
      responses: {
        200: z.object({
          series: z.array(z.object({
            date: z.string(),
            amount: z.number(),
          })),
          total: z.number(),
          previousTotal: z.number(),
          prevStart: z.string(),
          prevEnd: z.string(),
        }),
      },
    },
  },
  goals: {
    list: {
      method: "GET" as const,
      path: "/api/goals",
      responses: {
        200: z.array(z.custom<typeof goals.$inferSelect>()),
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/goals",
      input: insertGoalSchema,
      responses: {
        201: z.custom<typeof goals.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: "PUT" as const,
      path: "/api/goals/:id",
      input: insertGoalSchema.partial(),
      responses: {
        200: z.custom<typeof goals.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/goals/:id",
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  clients: {
    list: {
      method: "GET" as const,
      path: "/api/clients",
      responses: {
        200: z.array(z.custom<typeof clients.$inferSelect>()),
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/clients",
      input: insertClientSchema,
      responses: {
        201: z.custom<typeof clients.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: "PUT" as const,
      path: "/api/clients/:id",
      input: insertClientSchema.partial(),
      responses: {
        200: z.custom<typeof clients.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/clients/:id",
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    }
  },
  sessions: {
    list: {
      method: "GET" as const,
      path: "/api/sessions",
      input: z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        clientId: z.string().optional(), // Query param is string, needs coerce
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof workSessions.$inferSelect & { client?: typeof clients.$inferSelect | null }>()),
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/sessions",
      input: insertWorkSessionSchema,
      responses: {
        201: z.custom<typeof workSessions.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: "PUT" as const,
      path: "/api/sessions/:id",
      input: insertWorkSessionSchema.partial(),
      responses: {
        200: z.custom<typeof workSessions.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/sessions/:id",
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    stats: {
      method: "GET" as const,
      path: "/api/sessions/stats",
      responses: {
        200: z.object({
          currentFortnightTotal: z.number(),
          lastFortnightTotal: z.number(),
          unbilledTotal: z.number(),
        }),
      }
    },
    copyLastWeek: {
      method: "POST" as const,
      path: "/api/sessions/copy-last-week",
      input: z.object({
        targetWeekStart: z.string().optional(), // YYYY-MM-DD, defaults to current week's Sunday
      }).optional(),
      responses: {
        200: z.object({
          createdCount: z.number(),
          skippedCount: z.number(),
        }),
        400: errorSchemas.validation,
      }
    }
  },
  settings: {
    get: {
      method: "GET" as const,
      path: "/api/settings",
      responses: {
        200: z.custom<typeof invoiceSettings.$inferSelect>(),
      },
    },
    update: {
      method: "PUT" as const,
      path: "/api/settings",
      input: insertInvoiceSettingsSchema.partial(),
      responses: {
        200: z.custom<typeof invoiceSettings.$inferSelect>(),
      },
    }
  },
  invoices: {
    list: {
      method: "GET" as const,
      path: "/api/invoices",
      responses: {
        200: z.array(z.custom<typeof invoices.$inferSelect & { client: typeof clients.$inferSelect | null }>()),
      },
    },
    get: {
      method: "GET" as const,
      path: "/api/invoices/:id",
      responses: {
        200: z.custom<typeof invoices.$inferSelect & { client: typeof clients.$inferSelect | null, items: typeof invoiceLineItems.$inferSelect[] }>(),
        404: errorSchemas.notFound,
      },
    },
    generatePreview: {
      method: "POST" as const,
      path: "/api/invoices/preview",
      input: z.object({
        clientId: z.number(),
        startDate: z.string().min(1, "start_date is required"),
        endDate: z.string().min(1, "end_date is required"),
        groupByDay: z.boolean().default(false),
        groupingMode: z.enum(GROUPING_MODES).default("none"),
        quantityMode: z.enum(QUANTITY_MODES).default("hours"),
        roundingIncrement: z.number().optional(),
        enableGst: z.boolean().default(false),
        gstRate: z.number().default(10),
        discountType: z.enum(DISCOUNT_TYPES).optional(),
        discountValue: z.number().optional(),
      }),
      responses: {
        200: z.object({
          lineItems: z.array(z.object({
            description: z.string(),
            quantity: z.number(),
            unitPrice: z.number(),
            amount: z.number(),
            workSessionIds: z.array(z.number()),
          })),
          subtotalCents: z.number(),
          discountCents: z.number(),
          taxCents: z.number(),
          totalCents: z.number(),
          subtotal: z.number(),
          total: z.number(),
        }),
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/invoices",
      input: z.object({
        clientId: z.number(),
        issueDate: z.string(),
        dueDate: z.string(),
        items: z.array(z.object({
          description: z.string(),
          quantity: z.number(),
          unitPrice: z.number(),
          amount: z.number(),
          workSessionIds: z.array(z.number()).optional(),
        })),
        notes: z.string().optional(),
        taxRate: z.number().optional(),
        taxAmount: z.number().optional(),
        discountAmount: z.number().optional(),
        templateId: z.number().optional(),
      }),
      responses: {
        201: z.custom<typeof invoices.$inferSelect>(),
      },
    },
    update: {
      method: "PUT" as const,
      path: "/api/invoices/:id",
      input: z.object({
        status: z.enum(INVOICE_STATUSES),
      }),
      responses: {
        200: z.custom<typeof invoices.$inferSelect>(),
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/invoices/:id",
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
        400: errorSchemas.validation,
      },
    }
  },
  templates: {
    list: {
      method: "GET" as const,
      path: "/api/templates",
      responses: {
        200: z.array(z.custom<typeof invoiceTemplates.$inferSelect>()),
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/templates",
      responses: {
        201: z.custom<typeof invoiceTemplates.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: "PUT" as const,
      path: "/api/templates/:id",
      responses: {
        200: z.custom<typeof invoiceTemplates.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/templates/:id",
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    setDefault: {
      method: "POST" as const,
      path: "/api/templates/:id/default",
      responses: {
        200: z.custom<typeof invoiceTemplates.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    upload: {
      method: "POST" as const,
      path: "/api/templates/upload",
      responses: {
        200: z.object({ url: z.string() }),
        400: errorSchemas.validation,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
