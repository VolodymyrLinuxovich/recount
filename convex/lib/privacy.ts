// What Recount actually stores and shares. Checked against the code; keep it true when the code changes.
// Used by the helper (Lupa) and mirrored on the /privacy page.

export const PRIVACY_FACTS = `What Recount keeps and shares (true as of this build):
- What we store, in our database (Convex): the bill photo or PDF you upload, what we read from it (hospital, charges, account number, the patient's name and address if printed), your answers to the questions (household size, yearly income, insurance, medical costs), the letters, the steps the app took, and helper chat messages. Long numbers that look like Social Security or account numbers are removed from chat messages before they're stored.
- Who processes it: the bill image and the facts about the bill are sent to Anthropic's Claude API to read the bill, write the letters and answer chat questions. Anthropic handles that data under its own commercial terms and retention policy. When we look up a hospital's prices, our Apify Actor receives only the hospital's name and website and the billing codes on the bill, never the patient's name, account or income.
- Who can see it: there are no accounts. A bill opens only with its private link, which holds a secret key kept on your phone. The small Recount team can see the database to run and fix the service.
- What we never do: we don't sell or share your information, we don't send anything to the hospital (you send your own letters), and we never ask for payment, a Social Security number or bank details.
- How long we keep it: until you delete it. There is no automatic expiry yet.
- How to delete: the "Delete this bill" button removes the bill, the photo, the step log and its chat from our database right away. Copies Anthropic may hold follow Anthropic's policy, not ours.`;
