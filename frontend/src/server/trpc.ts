import { initTRPC, TRPCError } from "@trpc/server";
import { ZodError } from "zod";

export const createTRPCContext = async () => {
  return {};
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

export function toTRPCError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;
  const message =
    error instanceof Error ? error.message : "Something went wrong";
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
}
