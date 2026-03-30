import { z } from "zod";

export const SubmitVerdictSchema = z.object({
  result: z.enum(["pass", "fail", "partial"]),
  report: z.string().min(1),
});

export const ImplementerResponseSchema = z.object({
  agrees: z.boolean(),
  response: z.string().optional(),
});

export const RefereeVerdictSchema = z.object({
  result: z.enum(["pass", "fail", "partial"]),
  report: z.string().min(1),
});

export const SpawnVerifierSchema = z.object({
  verifierAgentId: z.string().min(1),
});

export const SpawnRefereeSchema = z.object({
  refereeAgentId: z.string().min(1),
});
