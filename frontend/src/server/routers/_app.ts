import { z } from "zod";
import { createTRPCRouter, publicProcedure, toTRPCError } from "@/server/trpc";
import { generateBuyerPrompts } from "@/lib/prompts/generate";
import { analyzeWebsite } from "@/lib/analyze";

const promptSchema = z.object({
  id: z.string(),
  prompt: z.string().min(1),
  category: z.string(),
  selected: z.boolean(),
  queries: z.array(z.string()),
});

export const appRouter = createTRPCRouter({
  generatePrompts: publicProcedure
    .input(z.object({ url: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        const prompts = await generateBuyerPrompts(input.url);
        return { prompts };
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  analyze: publicProcedure
    .input(
      z.object({
        url: z.string().min(1),
        prompts: z.array(promptSchema).min(1),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await analyzeWebsite({
          url: input.url,
          prompts: input.prompts,
        });
      } catch (error) {
        throw toTRPCError(error);
      }
    }),
});

export type AppRouter = typeof appRouter;
