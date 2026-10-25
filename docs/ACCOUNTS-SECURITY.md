# Accounts security review (2026-10-24)

## Retest on main b70f9e4: H1, M1 and L4 fixed

I reran the same scripts on local dev, which was serving b70f9e4. Staging is not deployed yet.

| Finding | After b70f9e4 |
|---|---|
| H1 sign-up bypass | `flow: "signUp"` for an existing email is refused with "An account with this email already exists. Please sign in.", with the wrong password (30 of 30) **and** the right one. A locked account stays locked |
| M1 stale login after delete | Old JWT: `profile.get` returns `null`, `profile.set` throws "Please sign in first.", `mine` returns `[]`. `cases.start` still works, but the bill has no owner (an anonymous bill with its own link) |
| L4 `ownerId` | `cases.get` now returns `mine: true/false` and no `ownerId` |
| Everything else | Same results as before: no IDOR on cases, claim, chat or profile; `deleteBills` true and false both behave as described |

Note on the suggested H1 fix below: `Password`'s `profile()` is called without `await`, so the check can't live there. b70f9e4 wraps the provider's `authorize` instead (`convex/auth.ts`), which works. `getAuthUserId` is now called only inside `convex/lib/user.ts` `currentUser()`.

**Staging (avid-lion-854, main a1dda20): same result.** I tested against the backend directly, not through the UI. Sign-up for an existing email is refused (20 of 20 guesses, plus the right password) and a locked account stays locked. `flow: "reset"` is refused. No IDOR on get, remove, unapprove, submitHousehold, claim, chat or profile. A stale JWT after delete is refused by profile and `mine`, and `cases.start` with it makes an unowned bill. `deleteBills` true and false both work. Both test accounts and all 3 test bills were deleted through the public functions and checked gone.

Still open (low): L1 lockout of someone else's account (now the only way back in is waiting), L2 timing enumeration, L3 first claim wins, L5 shared limits, L6 `authRateLimits` rows left after delete.

The original review follows.

Scope: the optional accounts in `~/Code/recount` main at `d5ee092`: `convex/auth.ts`, `auth.config.ts`, `http.ts`, `cases.ts` (owner access, `claim`, `mine`), `chat.ts`, `profile.ts`, `account.ts`, `schema.ts`, `lib/privacy.ts`. The auth library is `@convex-dev/auth` 0.0.96, which is the latest on npm.

How: code reading plus live tests on local dev (`http://127.0.0.1:3210`) with `ConvexHttpClient`, calling the same public functions the UI calls. I made three test accounts, signed them up and deleted them, and removed every test case with `cases:adminRemove`. One orphan `profiles` row ("Ghost", from finding M1) is still on dev, because no function can delete it. Remove it in the dashboard. No code was edited.

## Summary

| # | Severity | Finding |
|---|---|---|
| H1 | **High** | The sign-in rate limit is bypassed through `flow: "signUp"`. Password guessing is unlimited, and it works even while the account is locked |
| M1 | **Medium** | After `account.remove`, the old login token works for up to 1 hour. It recreates the profile and new bills under the deleted user |
| L1 | Low | Anyone who knows an email can keep that account locked out of `signIn` |
| L2 | Low | Account enumeration through timing (7 ms vs 60 ms) and through sign-up |
| L3 | Low | Anyone holding a bill's link can claim an unowned bill first; the patient then can't claim it |
| L4 | Low | `cases.get` returns `ownerId` (the account's user id) to anyone holding the link |
| L5 | Low | No limit on account creation; the upload and create limits are shared by everyone |
| L6 | Low | `account.remove` leaves `authRateLimits` rows behind; profile details copied into letters stay when bills are kept |
| P | Wording | Two lines in `privacy.ts` are not fully true yet (see below) |

What held up (tested live, all pass):

- **No IDOR on cases.** User B, with no token or a wrong token, gets `null` from `get` and `remove`, and `Case not found` from `unapprove` and `correctLine`. All case mutations go through the same `owned()` helper (`cases.ts:18`). `chat.ts:19` `caseIfOwned` is a faithful copy of it.
- **`claim` can't steal.** A guessed token claims 0. A bill already owned by A claims 0, even for B holding the right token. A signed-out claim gets "Please sign in first." Cases with no token are never claimable (`cases.ts:308`).
- **`mine`** only lists your own bills.
- **`profile.get`/`set`** take no user argument, so there's no way to name someone else. Signed out, `get` returns `null`.
- **Chat after claiming.** The owner can send and list without the token. B with no token gets `[]` and "Conversation not found." on a new session for A's case.
- **`deleteBills: false`** keeps the bill and its chat reachable by token only. The old JWT gets `null` for it.
- **`deleteBills: true`** removes the bill. Its token then returns `null`.
- **After `account.remove`**, the refresh token gets no new tokens and sign-in with the old password fails.
- **Password rules.** 8 to 200 characters. Email is trimmed, lowercased and checked (sign-in is case-insensitive). Error messages from the library come out as a generic "Server Error", so wrong-password vs unknown-email isn't told apart by text.

## Findings

### H1. Sign-in rate limit bypassed through sign-up (High)

- **Where:** `convex/auth.ts:22-25` (`signIn: { maxFailedAttempsPerHour: 10 }`). The cause is in the library: `@convex-dev/auth/dist/server/implementation/mutations/createAccountFromCredentials.js:27-36`. When `flow: "signUp"` is used with an email that already has an account, the library checks the password against the stored hash. A wrong password throws "already exists". The **right** password returns the existing account and signs you in. This path never reads or writes `authRateLimits`. Only `retrieveAccountWithCredentials.js` (the `signIn` flow) does.
- **Scenario (reproduced):** I locked account A with 12 wrong `signIn` attempts. The correct password on `signIn` was then refused. Next I sent 30 wrong guesses with `flow: "signUp"`: all 30 were rejected, and none counted toward the limit. Then `flow: "signUp"` with the correct password returned **fresh tokens, while the account was still locked**. Each guess costs one scrypt (~60 ms) and can run in parallel. An attacker who knows a user's email can guess passwords without limit. An account holds name, address, DOB, phone, every bill and every bill's private link (`mine` returns the tokens).
- **Fix:** refuse `signUp` for an email that already has an account, before any password check. `Password({ profile(params, ctx) })` gets the action ctx, so:
  ```ts
  // auth.ts
  async profile(params, ctx) {
    const email = …; // as now
    if (params.flow === "signUp" && (await ctx.runQuery(internal.authCheck.accountExists, { email })))
      throw new ConvexError("An account with this email already exists. Please sign in.");
    return { email };
  }
  // authCheck.ts (internalQuery)
  accountExists: ({ email }) => ctx.db.query("authAccounts").withIndex("providerAndAccountId", q => q.eq("provider", "password").eq("providerAccountId", email)).unique() !== null
  ```
  This gives away nothing new, because sign-up already reveals that an email exists (L2). Also, since `flow` is client-controlled, refuse any `flow` other than `signIn`/`signUp` (no `reset`/`email-verification` providers are configured; today they throw anyway). Done: convex/auth.ts refuses every other flow, and allows `reset`/`reset-verification` only when password reset by email is switched on. Retest: 30 `signUp` guesses must all fail with no token, and the correct password via `signUp` must not sign in.

### M1. A deleted account's login keeps working for up to an hour (Medium)

- **Where:** `getAuthUserId` only reads the JWT `sub`. It never checks that the session or the user still exists. Every caller trusts it: `profile.ts:11,39`, `cases.ts:23,73,302,323`, `chat.ts:24`, `account.ts:9`. JWTs last 1 hour (library default). `account.remove` (`account.ts:26-34`) deletes sessions and refresh tokens, which stops renewal, but the current JWT stays valid until it expires.
- **Scenario (reproduced):** A deleted their account (`deleteBills: false`). Using A's old JWT:
  - `profile.set({ name: "Ghost", dob: "1990-01-01" })` succeeded, and `profile.get` returned it. A new `profiles` row was created for a user id that no longer exists.
  - `cases.start` created a bill with `ownerId` = the deleted user, and `mine` listed it. Account B (`deleteBills: true`) did the same.

  In real use: the patient deletes their account on the phone, and a laptop tab is still open. That tab can save profile details and upload bills for up to an hour. That data is tied to a user nobody can sign in as. No account deletion can ever remove it, and the privacy text says it was deleted.
- **Fix:** one helper used everywhere instead of `getAuthUserId`:
  ```ts
  export async function currentUser(ctx) {
    const userId = await getAuthUserId(ctx);
    const sessionId = await getAuthSessionId(ctx);
    if (!userId || !sessionId) return null;
    if (!(await ctx.db.get(sessionId)) || !(await ctx.db.get(userId))) return null;
    return userId;
  }
  ```
  Use it in `owned`, `caseIfOwned`, `start`, `claim`, `mine`, `profile.get/set` and `account.remove`. This also makes sign-out on another device take effect at once. Optionally shorten `jwt.durationMs`. Then delete the orphan "Ghost" profile on dev.

### L1. Lockout of someone else's account (Low)

- **Where:** library rate limit, keyed by account (`rateLimit.js`): 10 failures, then refills at one try per 6 minutes.
- **Scenario (reproduced):** 12 wrong `signIn` attempts on A's email made A's correct password fail too. One bad attempt every 6 minutes keeps it locked forever. Today the real user can still get in through the H1 sign-up path. Once H1 is fixed, they can't. The UI only gets "Server Error", so it can't tell the user they are locked out.
- **Fix:** accept for the hackathon. The data is still reachable by the bill links on the phone. At least map the error to "Too many tries. Please wait a few minutes." Longer term, add a CAPTCHA or an emailed sign-in link.

### L2. Account enumeration (Low)

- **Where:** library. `signIn` with an unknown email returns before hashing (median **7 ms**). A known email with a wrong password runs scrypt (median **60 ms**). `signUp` on an existing email fails, while a new email succeeds.
- **Impact:** someone can learn whether an email has a Recount account, which hints that the person has a hospital bill.
- **Fix:** accept, since sign-up enumeration is inherent without email verification. If wanted: say "If that email is new, your account was created" style messages, and pad sign-in to a fixed time in a wrapper action.

### L3. Any link holder can claim an unowned bill (Low)

- **Where:** `cases.ts:299-317`. The first signed-in caller with the token wins (`cases.ts:309`).
- **Scenario (reproduced):** B claimed a signed-out bill with its real token, and A's claim then returned 0. A patient who shared the link with a relative or a helper loses the ability to put that bill in their own account. The claimer sees it in "My bills" for good. A token holder could already read, edit and delete the bill, so the new risk is small.
- **Fix:** accept and say it in the UI ("Anyone with this link can open the bill"), or let a token holder release a claim.

### L4. `cases.get` returns `ownerId` (Low)

- **Where:** `cases.ts:100-102` strips only `token`. The owner's `users` id goes to anyone holding the link (seen in tests: `ownerId: "kn71z…"`).
- **Fix:** also strip `ownerId`, and return `mine: boolean` (owner === current user) if the UI needs it.

### L5. No limit on sign-ups; shared limits (Low)

- **Where:** no limit on `flow: "signUp"`. Each sign-up is one scrypt plus three inserts. `cases.ts:53,71` use one global key (`"upload"`, `"create"`, 60/min) for everyone, so one script can block uploads for all patients for a minute at a time (this predates accounts).
- **Fix:** accept for the demo. Later, key the limit by user id when signed in, keep a smaller anonymous pool, and add a daily cap on sign-ups.

### L6. Leftovers after account deletion (Low)

- `authRateLimits` rows (keyed by the deleted account id, no email) are not deleted (`account.ts` doesn't touch that table). Seen on dev after the test. Delete by `identifier = account._id` in the same loop as `authAccounts`.
- With `deleteBills: false`, any profile details the patient put into letters (name, address, DOB) stay in those bills. That's expected, but the privacy text should say it (below).

## `privacy.ts` lines that aren't fully true

| Line | Issue | Suggested wording |
|---|---|---|
| "Deleting your account removes your email, password hash, profile and sign-in records…" | True for the database rows, except for M1: another device stays signed in for up to an hour and can save new data. Also `authRateLimits` (L6). Fix M1 and L6 and the line becomes true | After the fixes, keep it. Add: "If you keep your bills, the letters keep the name and address you put in them." |
| "Without one, a bill opens only with its private link…" | True for new bills. Bills made before tokens existed open by their id alone (`cases.ts:27`). Check whether prod has any (`token` missing) and delete them or give them tokens | Keep it once no tokenless bills remain |

All other lines checked out against the code: hashed password (scrypt, by the library), no email verification and no reset, chat number redaction (`chat.ts:49-53`), what "Delete this bill" removes (`cases.ts:210-219`: steps, chat, file, case), and opening your own bills by signing in.

## Test scripts

In the scratchpad: `acct/t1.mjs` (sign-up, rate limit, H1), `t2.mjs` (IDOR, claim, chat, profile), `t3.mjs` (deletion, M1), `t4.mjs` (timing).
