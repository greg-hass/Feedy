import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const folderSchema = z.object({
  title: z.string().min(1).max(80),
  position: z.number().int().min(0).optional(),
});

export const updateFolderSchema = folderSchema.partial();

export const feedSchema = z.object({
  sourceUrl: z.string().url(),
  folderId: z.string().nullable().optional(),
  label: z.string().max(120).nullable().optional(),
  refreshIntervalMinutes: z.number().int().min(5).max(1440).nullable().optional(),
});

export const updateFeedSchema = z.object({
  folderId: z.string().nullable().optional(),
  label: z.string().max(120).nullable().optional(),
  title: z.string().max(200).optional(),
  position: z.number().int().min(0).optional(),
  isPinned: z.boolean().optional(),
  refreshIntervalMinutes: z.number().int().min(5).max(1440).nullable().optional(),
});

export const itemStateSchema = z.object({
  read: z.boolean().optional(),
  bookmarked: z.boolean().optional(),
});

export const searchSchema = z.object({
  q: z.string().default(""),
});

export const settingsSchema = z.object({
  theme: z.enum(["SYSTEM", "LIGHT", "DARK"]).optional(),
  refreshIntervalMinutes: z.number().int().min(5).max(1440).optional(),
  autoRefreshEnabled: z.boolean().optional(),
  readerOpenOriginalByDefault: z.boolean().optional(),
});
