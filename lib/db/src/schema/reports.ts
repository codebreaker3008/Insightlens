import { pgTable, text, serial, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reportsTable = pgTable("reports", {
  id: text("id").primaryKey(),
  query: text("query").notNull(),
  queryNormalized: text("query_normalized").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reportData: jsonb("report_data").notNull(),
});

export const insertReportSchema = createInsertSchema(reportsTable);
export type InsertReport = z.infer<typeof insertReportSchema>;
export type ReportRow = typeof reportsTable.$inferSelect;
