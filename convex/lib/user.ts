// The signed-in user, checked against the database. A sign-in token stays valid for up to an hour
// on its own, so after "Delete account" (or sign-out) we also require that the session and the
// user still exist. Otherwise an old token could recreate data nobody can delete.
import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function currentUser(ctx: QueryCtx | MutationCtx): Promise<Id<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const sessionId = await getAuthSessionId(ctx);
  if (!sessionId) return null;
  const session = await ctx.db.get(sessionId);
  if (!session || session.userId !== userId) return null;
  if (!(await ctx.db.get(userId))) return null;
  return userId;
}
