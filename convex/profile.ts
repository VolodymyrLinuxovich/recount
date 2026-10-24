// The signed-in user's details, used to fill in letters. Optional; never required to use Recount.
import { currentUser } from "./lib/user";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";

const clean = (s: string | undefined, max: number) => (s == null ? undefined : s.trim().slice(0, max) || undefined);

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUser(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    const p = await ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    return {
      accountEmail: user?.email ?? null,
      name: p?.name ?? null,
      street: p?.street ?? null,
      city: p?.city ?? null,
      zip: p?.zip ?? null,
      phone: p?.phone ?? null,
      email: p?.email ?? null,
      dob: p?.dob ?? null,
    };
  },
});

export const set = mutation({
  args: {
    name: v.optional(v.string()),
    street: v.optional(v.string()),
    city: v.optional(v.string()),
    zip: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    dob: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const userId = await currentUser(ctx);
    if (!userId) throw new ConvexError("Please sign in first.");
    const zip = clean(a.zip, 10);
    if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) throw new ConvexError("ZIP code should look like 94110.");
    const phone = clean(a.phone, 30);
    if (phone && (phone.replace(/\D/g, "").length < 10 || phone.replace(/\D/g, "").length > 15)) throw new ConvexError("Please enter a full phone number.");
    const email = clean(a.email, 254)?.toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new ConvexError("Please enter a valid email address.");
    const dob = clean(a.dob, 10);
    if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) throw new ConvexError("Date of birth should be YYYY-MM-DD.");
    const fields = { name: clean(a.name, 120), street: clean(a.street, 200), city: clean(a.city, 80), zip, phone, email, dob };
    const old = await ctx.db.query("profiles").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    if (old) await ctx.db.patch(old._id, fields);
    else await ctx.db.insert("profiles", { userId, ...fields });
  },
});
