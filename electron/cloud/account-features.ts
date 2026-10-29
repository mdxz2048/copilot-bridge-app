import {z} from 'zod';

export const FeedbackInputSchema=z.object({clientId:z.uuid(),kind:z.enum(['FEATURE','ISSUE','OTHER']),title:z.string().trim().min(1).max(80),content:z.string().trim().min(5).max(3000)}).strict();
export const FeedbackSchema=z.object({id:z.uuid(),kind:z.enum(['FEATURE','ISSUE','OTHER']),status:z.enum(['OPEN','IN_PROGRESS','RESOLVED']),title:z.string(),content:z.string(),createdAt:z.string(),updatedAt:z.string()});
export const FeedbackListSchema=z.object({data:z.array(FeedbackSchema),total:z.number().int(),page:z.number().int(),pageSize:z.number().int()});
export const BillsSchema=z.object({data:z.array(z.object({id:z.uuid(),category:z.enum(['BALANCE','CONSUMPTION']),type:z.string(),points:z.number(),balanceAfter:z.number().nullable(),occurredAt:z.string(),startedAt:z.string().nullable(),endedAt:z.string().nullable(),deviceName:z.string().nullable(),deviceId:z.string().nullable(),periodKind:z.string().nullable()})),
  pending:z.array(z.object({id:z.uuid(),deviceId:z.string(),deviceName:z.string(),startedAt:z.string()})),total:z.number().int(),page:z.number().int(),pageSize:z.number().int(),summary:z.object({balance:z.number(),totalAdded:z.number(),totalConsumed:z.number()})});
export type FeedbackInput=z.infer<typeof FeedbackInputSchema>;
export type FeedbackList=z.infer<typeof FeedbackListSchema>;
export type Bills=z.infer<typeof BillsSchema>;
