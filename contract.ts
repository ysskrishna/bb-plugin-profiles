import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  MAX_ID_LENGTH,
  MAX_MODELS,
  MAX_NAME_LENGTH,
  MAX_PROJECTS,
  MAX_PROVIDERS,
  normalizeRule,
  validId,
} from "./profiles";

export const PROFILES_CHANGED = "profiles-changed";
export const idSchema = z
  .string()
  .min(1)
  .max(MAX_ID_LENGTH)
  .refine(validId, "Invalid ID");
const nameSchema = z.string().trim().min(1).max(MAX_NAME_LENGTH);
export const ruleSchema = z
  .object({
    enabled: z.boolean(),
    limit: z.boolean(),
    modelIds: z.array(idSchema).max(MAX_MODELS),
  })
  .strict()
  .refine(
    (rule) => !rule.limit || rule.modelIds.length > 0,
    "Select at least one model",
  )
  .transform(normalizeRule);
export const defaultModelSchema = z
  .object({
    providerId: idSchema,
    model: idSchema,
    reasoningLevel: idSchema.optional(),
  })
  .strict();
export const profileSchema = z
  .object({
    id: idSchema,
    name: nameSchema,
    projectIds: z.array(idSchema).max(MAX_PROJECTS),
    providers: z
      .record(
        idSchema,
        z
          .object({
            enabled: z.boolean(),
            limit: z.boolean(),
            modelIds: z.array(idSchema).max(MAX_MODELS),
          })
          .strict(),
      )
      .refine(
        (providers) => Object.keys(providers).length <= MAX_PROVIDERS,
        "Too many configured providers",
      ),
    defaultModel: defaultModelSchema.optional(),
  })
  .strict();
export const hiddenModelsSchema = z.enum(["more", "remove"]);
export const snapshotSchema = z
  .object({
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    hiddenModels: hiddenModelsSchema,
    profiles: z.array(profileSchema).min(1),
  })
  .strict();
export const rpcContract = defineRpcContract({
  getSnapshot: { input: z.null(), output: snapshotSchema },
  setHiddenModels: {
    input: z.object({ mode: hiddenModelsSchema }).strict(),
    output: snapshotSchema,
  },
  createProfile: {
    input: z.object({ name: nameSchema, copyFromId: idSchema }).strict(),
    output: z.object({ snapshot: snapshotSchema, id: idSchema }).strict(),
  },
  renameProfile: {
    input: z.object({ id: idSchema, name: nameSchema }).strict(),
    output: snapshotSchema,
  },
  deleteProfile: {
    input: z.object({ id: idSchema }).strict(),
    output: snapshotSchema,
  },
  setProfileProjects: {
    input: z
      .object({ id: idSchema, projectIds: z.array(idSchema).max(MAX_PROJECTS) })
      .strict(),
    output: snapshotSchema,
  },
  setProvider: {
    input: z
      .object({ profileId: idSchema, providerId: idSchema, rule: ruleSchema })
      .strict(),
    output: snapshotSchema,
  },
  setDefaultModel: {
    input: z
      .object({
        profileId: idSchema,
        defaultModel: defaultModelSchema.nullable(),
      })
      .strict(),
    output: snapshotSchema,
  },
  reset: { input: z.null(), output: snapshotSchema },
});
