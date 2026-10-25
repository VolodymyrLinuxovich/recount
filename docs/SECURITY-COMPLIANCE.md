# Security, encryption and HL7

What Recount does today to protect a bill, what it doesn't do yet, and how a case leaves Recount in a standard health data format. Only what's true of this build. For the account sign-in review and its fixes, see [ACCOUNTS-SECURITY.md](ACCOUNTS-SECURITY.md). For what is stored and shared, see the live [privacy page](https://recount-nu.vercel.app/privacy), built from `convex/lib/privacy.ts`.

## HIPAA, plainly

Recount is not a HIPAA covered entity (it isn't a provider, a health plan or a clearinghouse). It has not signed a Business Associate Agreement (BAA) with anyone. So Recount doesn't claim to be HIPAA compliant.

What a HIPAA deployment would need, and where Recount stands:

| Piece | Today | To get there |
|---|---|---|
| Azure OpenAI (backup model for chat and letters) | Our own Azure resource. Microsoft doesn't use the data to train models. It may keep prompts up to 30 days for abuse checks | Microsoft offers its HIPAA BAA through the [Data Protection Addendum](https://www.microsoft.com/licensing/docs/view/Microsoft-Products-and-Services-Data-Protection-Addendum-DPA). Microsoft's own answer is that the BAA covers Azure OpenAI for text ([Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/1352009/how-to-make-azure-openai-hipaa-compliant-how-to-ge)). We send it text, plus a chat attachment photo only when Claude is unavailable |
| Azure AI Search, Content Safety, Document Intelligence | Our own Azure resources | Check each one on Microsoft's HIPAA in-scope list for the subscription before relying on it. We have not confirmed all three |
| Anthropic Claude (reads the bill, writes letters, Lupa) | Anthropic's commercial API terms | Anthropic offers a BAA to eligible customers; it would have to be signed |
| Convex (database and file storage) | Data encrypted at rest ([Convex](https://www.convex.dev/can-do/encryption)) | A BAA from Convex, or a different store for PHI |
| Vercel (web pages) | Serves the app; bills don't go through it, the browser talks to Convex directly | Nothing stored there |

The short version used in the README: the Azure parts are built on HIPAA-eligible Azure services, bills and photos are stored in Convex and read by Claude, and Recount has no BAA.

## Encryption

- **In transit.** Every connection uses TLS (HTTPS): the browser and phone to Vercel and Convex, and Convex to Anthropic, Azure (OpenAI, AI Search, Content Safety, Document Intelligence), Apify and Expo push. There are no plain HTTP calls in `convex/`.
- **At rest.** Convex encrypts stored data, including uploaded photos and PDFs. Azure services encrypt data they store at rest by default. Recount's Azure AI Search index holds only public hospital policy sentences, no patient data.
- **Not end to end.** Recount's own server code can read a bill, because it has to check it. Convex notes the same: its functions see decrypted data unless the app encrypts on the client.

## Who can open a bill

- Each bill has a random secret token, made with `crypto.randomUUID()` when the bill starts. Every call that reads or changes the bill needs it (`owned` in `convex/cases.ts`), unless the caller is the signed-in owner.
- The token lives only on the patient's phone and in the private link they choose to share.
- Accounts are optional. Passwords are stored hashed by Convex Auth.
- Uploads are checked by their stored type and size, not what the app says (`convex/cases.ts` `start`, `convex/lib/attach.ts`).
- Long numbers that look like Social Security or account numbers are removed from chat messages before they are stored or sent (`convex/chat.ts`).

## Deletion

"Delete this bill" removes the bill, its photo pages, the insurance statement, the step log, the AI call records, its chat (with attachments) and its push tokens right away. Deleting an account removes the email, password hash, profile and sign-in records, and optionally all the bills. Chat attachments are deleted 30 days after they're sent. Copies the AI and safety services keep follow their own policies.

## HL7 FHIR export

Any bill can be downloaded as an HL7 FHIR R4 Bundle (JSON) from the bill's "More" screen: **Download as HL7 FHIR (JSON)**. It's for handing the case to a patient advocate, a clinic or a provider system that reads FHIR, instead of retyping it.

- Code: `convex/lib/fhir.ts` (pure function), served by `convex/fhir.ts` behind the same token check as the bill. Tests: `tests/fhir.test.ts`.
- **Patient:** the name if printed. Never the insurance member ID.
- **Organization:** the hospital, and the insurer if there is a statement.
- **ChargeItem:** one per bill line. Codes use CPT `http://www.ama-assn.org/go/cpt`, HCPCS `http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets` and NUBC revenue codes. Each has its date, quantity and charge in USD.
- **Invoice:** the bill. It has the hospital account number and its lines, each pointing at its ChargeItem. It also has the total charges and the amount due.
- **Coverage and ExplanationOfBenefit:** the insurance statement, if added. Adjudication uses HL7's `submitted`, `eligible` and `benefit`, plus CARIN Blue Button's `memberliability` and `noncovered`.
- **DetectedIssue:** each problem Recount found, pointing at the lines and the invoice. Codes are Recount's finding names under `https://recount-nu.vercel.app/fhir/CodeSystem/finding`.
- Ids are stable UUIDs made from the bill's id, so the same bill exports the same file.
- The tests check R4's required fields, that every reference resolves inside the bundle, and the code systems. The export has not yet been run through the official HL7 validator.

## Sending it to an Azure FHIR service (not set up)

Azure Health Data Services runs a managed FHIR R4 server. It is billed by use (service runtime, storage, requests; see [pricing](https://azure.microsoft.com/pricing/details/health-data-services/)). Nothing below has been run. It creates resources on the Azure subscription, so it needs the owner's OK first.

```sh
az extension add --name healthcareapis
az group create --name recount-health --location westus2
az healthcareapis workspace create --resource-group recount-health --name recountws --location westus2
az healthcareapis workspace fhir-service create --resource-group recount-health --workspace-name recountws \
  --name recountfhir --kind fhir-R4 --location westus2 \
  --identity-type SystemAssigned \
  --authentication-configuration authority="https://login.microsoftonline.com/$(az account show --query tenantId -o tsv)" \
    audience="https://recountws-recountfhir.fhir.azurehealthcareapis.com" smart-proxy-enabled=false
```

Check the flags against `az healthcareapis workspace fhir-service create --help` for the installed extension. Then the export would be `POST`ed to `https://recountws-recountfhir.fhir.azurehealthcareapis.com/` as a transaction bundle, with a Microsoft Entra token for an app given the "FHIR Data Contributor" role. That needs a service principal secret in Convex, so it is left until there's a BAA and a reason to keep bills there.
