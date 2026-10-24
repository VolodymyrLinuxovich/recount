// What Recount actually stores and shares. Checked against the code; keep it true when the code changes.
// Used by the helper (Lupa) and mirrored on the /privacy page. The "who processes it" part is
// built from the deployment's settings, so it stays true when Azure services are turned on or off.
import { choose, type Provider, type Task } from "./model";
import { safetyOn } from "./safety";
import { searchOn } from "./search";

/** Which outside services this deployment sends data to, by purpose. */
export function processors() {
  const uses = (p: Provider, tasks: Task[]) => tasks.some((t) => { const c = choose(t); return c.primary.provider === p || c.fallback?.provider === p; });
  const all: Task[] = ["read", "column", "letters", "chat"];
  return {
    azureOpenAI: uses("azure", all) || searchOn(),
    openAI: uses("openai", all),
    contentSafety: safetyOn(),
    search: searchOn(),
  };
}

const NAMES: Record<Provider, string> = { anthropic: "Anthropic's Claude API", azure: "Microsoft's Azure OpenAI Service", openai: "an OpenAI-compatible model service" };

function modelLine(): string {
  const read = choose("read");
  const words = choose("letters");
  const talk = choose("chat");
  const name = (c: { provider: Provider }) => NAMES[c.provider];
  const parts = [
    `the bill image, and the insurance statement (EOB) image if you add one, go to ${name(read.primary)} to read them${read.fallback ? ` (or to ${name(read.fallback)} if that is unavailable)` : ""}`,
    `the facts about the bill (including the patient's name, account number and household answers) go to ${name(words.primary)} to write the letters${words.fallback ? `, or to ${name(words.fallback)} if that is unavailable` : ""}`,
    `chat messages and the bill's facts go to ${name(talk.primary)} to answer questions${talk.fallback ? `, or to ${name(talk.fallback)} if that is unavailable` : ""}`,
  ];
  let line = `- Who processes it: ${parts.join("; ")}. Each company handles that data under its own commercial terms and retention policy.`;
  const p = processors();
  if (p.azureOpenAI) line += " Microsoft may keep data sent to Azure OpenAI for up to 30 days to check for abuse.";
  if (p.search) line += " To find passages in hospitals' public policies, each chat question (and the hospital's name) is sent to Microsoft Azure: Azure OpenAI turns it into a search and Azure AI Search runs it.";
  if (p.contentSafety) line += " Each chat message and reply is also checked by Microsoft's Azure AI Content Safety service.";
  line += " When we look up a hospital's prices, our Apify Actor receives only the hospital's name and website and the billing codes on the bill, never the patient's name, account or income.";
  return line;
}

export function privacyFacts(): string {
  return `What Recount keeps and shares (true as of this build):
- What we store, in our database (Convex): the bill photo or PDF you upload, what we read from it (hospital, charges, account number, the patient's name and address if printed), the insurance statement (EOB) if you add one and what we read from it (insurer, member ID, claim number, amounts and denials), your answers to the questions (household size, yearly income, insurance, medical costs), the letters, the steps the app took, a record of each AI call (which service and model, how long, how many words; never the content), and helper chat messages. Long numbers that look like Social Security or account numbers are removed from chat messages before they're stored or sent anywhere.
${modelLine()}
- Who can see it: accounts are optional. Without one, a bill opens only with its private link, which holds a secret key kept on your phone. With an account, you can also open your own bills by signing in. The small Recount team can see the database to run and fix the service.
- Accounts (optional): we store your email, a hashed password (never the password itself) or your Google sign-in, and, if you add them, your name, address, phone and date of birth to fill in letters. There's no email verification and no password reset by email.
- What we never do: we don't sell or share your information, we don't send anything to the hospital (you send your own letters), and we never ask for payment, a Social Security number or bank details.
- How long we keep it: until you delete it. There is no automatic expiry yet.
- How to delete: the "Delete this bill" button removes the bill, the photo, the insurance statement, the step log, the AI call records and its chat from our database right away. Deleting your account removes your email, password hash, profile and sign-in records, and, if you choose, all your bills. Copies the AI and safety services may hold follow their own policies, not ours.`;
}
