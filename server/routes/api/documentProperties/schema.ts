import { z } from "zod";
import { propertyTypes } from "@shared/types/documentProperties";
import { iconNames } from "@shared/utils/IconNames";
import { BaseSchema } from "../schema";

const option = z.object({
  id: z.string().min(1).max(100),
  label: z.string().trim().min(1).max(100),
  color: z
    .string()
    .regex(/^#[a-f\d]{6}$/i)
    .optional(),
  icon: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("builtin"), value: z.enum(iconNames) }),
      z.object({ kind: z.literal("emoji"), value: z.uuid() }),
    ])
    .optional(),
  retired: z.boolean().optional(),
  shimmer: z.boolean().optional(),
});
const fields = z.object({
  name: z.string().trim().min(1).max(150),
  type: z.enum(propertyTypes),
  key: z
    .string()
    .regex(/^[a-zA-Z0-9_.:-]{1,128}$/)
    .optional(),
  access: z.enum(["managed", "open"]).optional(),
  options: z
    .array(option)
    .max(200)
    .refine(
      (options) => new Set(options.map((o) => o.id)).size === options.length,
      "Duplicate option IDs"
    )
    .optional(),
});
const documentId = z.object({ documentId: z.uuid() });
const write = documentId.extend({
  definitionId: z.uuid(),
  version: z.number().int().nonnegative(),
});
export const schemas = {
  empty: BaseSchema.extend({ body: z.object({}) }),
  create: BaseSchema.extend({ body: fields }),
  update: BaseSchema.extend({
    body: fields
      .pick({ name: true, access: true, options: true })
      .partial()
      .extend({ id: z.uuid() }),
  }),
  id: BaseSchema.extend({ body: z.object({ id: z.uuid() }) }),
  list: BaseSchema.extend({ body: documentId }),
  clear: BaseSchema.extend({ body: write }),
  set: BaseSchema.extend({
    body: write.extend({
      value: z.union([
        z.string().max(16000),
        z.number(),
        z.boolean(),
        z.array(z.string().max(2000)).max(200),
      ]),
    }),
  }),
};
export type PropertyRequest<K extends keyof typeof schemas> = z.infer<
  (typeof schemas)[K]
>;
