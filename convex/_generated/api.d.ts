/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as agent from "../agent.js";
import type * as auth from "../auth.js";
import type * as authCheck from "../authCheck.js";
import type * as cases from "../cases.js";
import type * as chat from "../chat.js";
import type * as chatAgent from "../chatAgent.js";
import type * as http from "../http.js";
import type * as lib_bill from "../lib/bill.js";
import type * as lib_checks from "../lib/checks.js";
import type * as lib_eligibility from "../lib/eligibility.js";
import type * as lib_hospital from "../lib/hospital.js";
import type * as lib_lang from "../lib/lang.js";
import type * as lib_letters from "../lib/letters.js";
import type * as lib_privacy from "../lib/privacy.js";
import type * as lib_reference from "../lib/reference.js";
import type * as lib_sample from "../lib/sample.js";
import type * as lib_statewide from "../lib/statewide.js";
import type * as lib_user from "../lib/user.js";
import type * as profile from "../profile.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  agent: typeof agent;
  auth: typeof auth;
  authCheck: typeof authCheck;
  cases: typeof cases;
  chat: typeof chat;
  chatAgent: typeof chatAgent;
  http: typeof http;
  "lib/bill": typeof lib_bill;
  "lib/checks": typeof lib_checks;
  "lib/eligibility": typeof lib_eligibility;
  "lib/hospital": typeof lib_hospital;
  "lib/lang": typeof lib_lang;
  "lib/letters": typeof lib_letters;
  "lib/privacy": typeof lib_privacy;
  "lib/reference": typeof lib_reference;
  "lib/sample": typeof lib_sample;
  "lib/statewide": typeof lib_statewide;
  "lib/user": typeof lib_user;
  profile: typeof profile;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
