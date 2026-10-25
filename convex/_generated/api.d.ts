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
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as followUp from "../followUp.js";
import type * as followUpAgent from "../followUpAgent.js";
import type * as http from "../http.js";
import type * as lib_bill from "../lib/bill.js";
import type * as lib_checks from "../lib/checks.js";
import type * as lib_complaint from "../lib/complaint.js";
import type * as lib_docIntel from "../lib/docIntel.js";
import type * as lib_eligibility from "../lib/eligibility.js";
import type * as lib_eob from "../lib/eob.js";
import type * as lib_eobChecks from "../lib/eobChecks.js";
import type * as lib_hospital from "../lib/hospital.js";
import type * as lib_lang from "../lib/lang.js";
import type * as lib_letterCheck from "../lib/letterCheck.js";
import type * as lib_letters from "../lib/letters.js";
import type * as lib_model from "../lib/model.js";
import type * as lib_pipeline from "../lib/pipeline.js";
import type * as lib_privacy from "../lib/privacy.js";
import type * as lib_reference from "../lib/reference.js";
import type * as lib_safety from "../lib/safety.js";
import type * as lib_sample from "../lib/sample.js";
import type * as lib_search from "../lib/search.js";
import type * as lib_statewide from "../lib/statewide.js";
import type * as lib_timeout from "../lib/timeout.js";
import type * as lib_user from "../lib/user.js";
import type * as metrics from "../metrics.js";
import type * as pipeline from "../pipeline.js";
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
  crons: typeof crons;
  dashboard: typeof dashboard;
  followUp: typeof followUp;
  followUpAgent: typeof followUpAgent;
  http: typeof http;
  "lib/bill": typeof lib_bill;
  "lib/checks": typeof lib_checks;
  "lib/complaint": typeof lib_complaint;
  "lib/docIntel": typeof lib_docIntel;
  "lib/eligibility": typeof lib_eligibility;
  "lib/eob": typeof lib_eob;
  "lib/eobChecks": typeof lib_eobChecks;
  "lib/hospital": typeof lib_hospital;
  "lib/lang": typeof lib_lang;
  "lib/letterCheck": typeof lib_letterCheck;
  "lib/letters": typeof lib_letters;
  "lib/model": typeof lib_model;
  "lib/pipeline": typeof lib_pipeline;
  "lib/privacy": typeof lib_privacy;
  "lib/reference": typeof lib_reference;
  "lib/safety": typeof lib_safety;
  "lib/sample": typeof lib_sample;
  "lib/search": typeof lib_search;
  "lib/statewide": typeof lib_statewide;
  "lib/timeout": typeof lib_timeout;
  "lib/user": typeof lib_user;
  metrics: typeof metrics;
  pipeline: typeof pipeline;
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
