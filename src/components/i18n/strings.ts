// Every piece of UI text, in English and Spanish.
// `es` must have exactly the keys of `en` with the same shapes, so a missing
// translation is a type error. Entries that need numbers or names are functions.
//
// Text that comes from the backend (step labels, findings, eligibility basis,
// letters, audit quotes and rule titles) is not here and stays as sent.

export type Lang = "en" | "es";

export const locale = (lang: Lang) => (lang === "es" ? "es-US" : "en-US");

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

type DocKind = "charity_care" | "discount_payment" | "debt_collection" | "application" | "application_discount";

const en = {
  // Header and footer
  "lang.group": "Language",
  footer:
    "Not legal or medical advice. Recount checks your bill against public rules and prices; the hospital makes the final decision.",

  // Start page
  "start.eyebrow": "For ER bills in San Francisco",
  "start.promise": "Got a hospital bill you can’t pay? Let’s check it line by line, and see if you owe anything at all.",
  "start.lede":
    "We compare your bill with the hospital’s own published prices and California’s charity care rules. Then we draft the letters. You read them and decide. Nothing is sent for you.",
  "start.photo": "Take a photo of your bill",
  "start.uploading": "Uploading your bill…",
  "start.hint": "Or choose a photo or PDF you already have. Get the page that lists each charge, if you can.",
  "start.sample": "Try a sample bill",
  "start.sampleBusy": "Opening the sample…",
  "start.uploadFailed": "We couldn’t upload that file. Check your connection and try again.",
  "start.sampleFailed": "Something went wrong starting the sample. Try again.",
  "start.how1": "We read every line and mark the ones that don’t match the hospital’s own numbers.",
  "start.how2": "You answer three questions about your household.",
  "start.how3": "You get a plain answer, the rule behind it, and letters ready to send.",

  // Problems with the chosen file
  "file.pdfTooBig": "That PDF is too big. Try a photo of the page with the charges.",
  "file.notImage": "Please choose a photo or a PDF of your bill.",
  "file.cantOpen": "We couldn’t open that photo. Try taking a new one, or save it as a JPEG first.",
  "file.tooLarge": "That photo is too large to send. Try a closer photo of just the charges.",

  // Case page
  "case.opening": "Opening your bill…",
  "case.notFound": "We couldn’t find this bill.",
  "case.startAgain": "Start again",
  "case.cantRead": (v: { pdf: boolean }) => (v.pdf ? "We couldn’t read this file." : "We couldn’t read this photo."),
  "case.tryAgain": "Try again",
  "case.details": "Details",
  "case.eyebrow": "Recounting",
  "case.reading": "Going through your bill, line by line.",
  "case.photoAlt": "Your bill",
  "case.log": "What Recount did",
  // Progress through a bill
  "progress.label": "Your progress",
  "progress.of": (v: { n: number; total: number }) => `Step ${v.n} of ${v.total}`,
  "progress.1": "We read your bill",
  "progress.2": "You answer 3 questions",
  "progress.3": "You check your letters",
  "progress.4": "You send them",
  "progress.now1": "We’re reading your bill. This takes about a minute.",
  "progress.now2": "Look at what we marked, then answer three questions below.",
  "progress.now3": "Read your answer and your letters. Change anything, then approve.",
  "progress.now4": "Your letters are ready. Here’s how to send them.",
  "case.err.unavailable": (v: { pdf: boolean }) =>
    `Our bill reader is unavailable right now, so we couldn’t read your ${v.pdf ? "file" : "photo"}. Please try again in a few minutes. The sample bill on the start page still works.`,
  "case.err.notBill": (v: { pdf: boolean }) =>
    `This doesn’t look like a hospital bill. Try a ${v.pdf ? "file" : "photo"} of the page that lists each charge.`,
  "case.err.generic": (v: { pdf: boolean }) => {
    const what = v.pdf ? "file" : "photo";
    return `Something went wrong while reading your ${what}. Try again with a clear, flat ${what} of the page that lists each charge.`;
  },

  // Step log
  "step.starting": "Starting…",
  "step.running": "working",
  "step.done": "done",
  "step.warn": "note",
  "step.error": "problem",

  // The short answer
  "answer.eyebrow": "The short answer",
  "answer.freeLead": "You likely owe",
  "answer.discount": "You likely qualify for a discount.",
  "answer.askOffLead": "Ask them to take off up to",
  "answer.billSays": (v: { amount: string }) => `The bill says ${v.amount}. `,
  "answer.freeSub": "Under the hospital’s own policy, your household qualifies for free care.",
  "answer.discountSub":
    "State law caps what they can charge you at roughly what a government program would pay, usually far less than this bill.",
  "answer.alsoMarked": (v: { amount: string }) => ` We also marked up to ${v.amount} in charges worth questioning.`,
  "answer.why": "Why",
  "answer.mediStrong": "Also check Medi-Cal.",
  "answer.mediBody": (v: { pct: string }) =>
    `At ${v.pct}% of the poverty line you may qualify, and Medi-Cal can pay bills from up to three months before you apply. Apply at`,
  "answer.mediTail": "or ask the hospital’s financial counselor.",

  // The marked-up bill
  "bill.h": "Your bill, recounted",
  "bill.srcClaude": "read by Claude from your photo",
  "bill.srcSample": "sample bill source data",
  "bill.photoAlt": "The bill you uploaded",
  "bill.showLess": "Show less",
  "bill.tapSample": "The sample bill. Tap to see all of it",
  "bill.tapPhoto": "Your photo. Tap to see all of it",
  "bill.openFile": "Open the file you uploaded",
  "bill.stamp": (v: { n: number }) => `${v.n} ${plural(v.n, "thing", "things")} to ask about`,
  "bill.stampUpTo": (v: { amount: string }) => ` · up to ${v.amount}`,
  "bill.noName": "Hospital name not printed",
  "bill.patient": "Patient",
  "bill.account": "Account",
  "bill.visit": "Visit",
  "bill.statement": "Statement",
  "bill.summary": "Summary bill. Ask for the itemized one.",
  "bill.code": (v: { code: string }) => `code ${v.code}`,
  "bill.rev": (v: { code: string }) => `rev ${v.code}`,
  "bill.qty": (v: { n: number }) => `qty ${v.n}`,
  "bill.dupThis": (v: { line: number; amount: string }) => `same as line ${v.line}? take off ${v.amount}`,
  "bill.dupOther": (v: { line: number }) => `listed again on line ${v.line}`,
  "bill.aboveList": (v: { amount: string }) => `${v.amount} over their own list price`,
  "bill.cashIs": (v: { cash: string }) => `cash price is ${v.cash} a unit`,
  "bill.askCash": "ask for the cash price",
  "bill.total": "Total charges",
  "bill.insurancePaid": "Insurance paid",
  "bill.adjustments": "Adjustments",
  "bill.youPaid": "You paid",
  "bill.owe": "They say you owe",
  "bill.totalNote": "lines don’t add up to this",
  "bill.noFindings":
    "No line-level problems found against the hospital’s published prices. Financial assistance can still cover the whole bill.",
  "bill.confHigh": "Based on the hospital’s published number.",
  "bill.confCheck": "Worth asking. It may have a reason.",
  "bill.couldTakeOff": (v: { amount: string }) => ` Could take off ${v.amount}.`,

  // Household questions
  "hh.h": "Three questions",
  "hh.lede":
    "California hospitals have to give free or discounted care based on household size and income. Your answers stay with this bill.",
  "hh.needOop": "We need one more number: your out-of-pocket costs at this hospital.",
  "hh.q1": "How many people are in your household?",
  "hh.q1help": "You, plus anyone you support or file taxes with.",
  "hh.fewer": "One fewer person",
  "hh.more": "One more person",
  "hh.people": (v: { n: number }) => `${v.n} ${plural(v.n, "person", "people")}`,
  "hh.q2": "About how much does your household make in a year?",
  "hh.q2help": "Before taxes. A rough number is fine.",
  "hh.typeIncome": "Type a number, like 32000 or 32k.",
  "hh.smallIncome": (v: { amount: string; n: number }) =>
    `That’s ${v.amount} a year. If you meant thousands, type ${v.n}k.`,
  "hh.perYear": (v: { amount: string }) => `${v.amount} a year`,
  "hh.q3": "Did you have health insurance for this visit?",
  "hh.no": "No",
  "hh.yes": "Yes",
  "hh.oopLabel":
    "How much have you paid or been billed at this hospital in the last 12 months, after insurance? Include this bill.",
  "hh.typeOop": "Type a number, like 4500 or 4.5k.",
  "hh.checking": "Checking the rules…",
  "hh.submit": "See my answer",
  "hh.checkIncome": "check the income amount",
  "hh.addIncome": "add your yearly income",
  "hh.answerIns": "answer the insurance question",
  "hh.checkOop": "check the out-of-pocket amount",
  "hh.addOop": "add your out-of-pocket costs",
  "hh.missing": (v: { list: string }) => `To continue, ${v.list}.`,
  "hh.failed": "That didn’t go through. Check the numbers and try again.",

  // Letters
  "letters.h": "Your letters",
  "letters.ready": "Ready to send",
  "letters.writing": "Writing your letters…",
  "letters.srcClaude": "written by Claude",
  "letters.srcTemplate": "standard template",
  "letters.approvedNote":
    "You approved these. Recount hasn’t sent anything. Send them yourself, by mail, email, or the hospital’s patient portal, and keep a copy.",
  "letters.callFirst": "Call billing first and ask for their mailing address or email for financial assistance:",
  "letters.emailAssist": "Email the assistance request",
  "letters.emailDispute": "Email the billing questions",
  "letters.lede": "Read them. Change anything that’s wrong, and fill in the [brackets]. Nothing goes out until you send it.",
  "letters.subject": "Subject",
  "letters.bodyLabel": (v: { title: string }) => `${v.title} text`,
  "letters.copy": "Copy",
  "letters.copied": "Copied",
  "letters.download": "Download .txt",
  "letters.saving": "Saving…",
  "letters.approve": "These look right. Approve",
  "letters.titleAssist": "Financial assistance request",
  "letters.titleDispute": "Billing questions",
  "letters.sentInEnglish": "This is the English letter that goes to the hospital.",
  "letters.patientCopyH": "What your letter says, in Spanish",
  "letters.patientCopyNote": "Read-only. If you change the English letter above, this copy doesn’t change.",

  // Printing, the "how to send it" guide, and the home screen tip
  "print.one": "Print or save as PDF",
  "print.all": "Print all letters",
  "print.brackets": "Fill in the [brackets] before you print, or write them in by hand on the paper.",
  "send.h": "How to send it",
  "send.intro": "You approved your letters. Recount has not sent anything. Do these steps yourself, one at a time.",
  "send.step1H": "Call the billing office",
  "send.step1": "Ask them:",
  "send.step1Ask": "“Where do I send a financial assistance application, and is there a form?”",
  "send.inEnglish": "In English:",
  "send.call": (v: { phone: string }) => `Call ${v.phone}`,
  "send.noPhone": "The billing phone number is on your bill, usually near the top or next to “Questions?”.",
  "send.step2H": "Send your letter",
  "send.step2": "Send it by mail, by email, or through the hospital’s patient portal. Keep a copy for yourself.",
  "send.step2Mail": "If you mail it, think about certified mail at the post office. You get a receipt that shows they got it.",
  "send.step3H": "Ask them to pause collections",
  "send.step3": "Ask them to put your account on hold, so it doesn’t go to collections while they review your request.",
  "send.step4H": "Write down every call",
  "send.step4": "Write the date, the name of the person you spoke to, and what they said.",
  "send.notesLabel": "Your notes",
  "send.notesPlaceholder": "Example: Called billing. Spoke to Maria. She said to mail the form to…",
  "send.notesSaved": "Saved on this phone only.",
  "send.step5H": "Apply for financial assistance",
  "send.step5": "California law gives you the right to apply. The hospital must give you its application form when you ask for it.",
  "send.policyLink": "Read the hospital’s assistance policy",
  "send.applicationLink": "Get the hospital’s application form",
  "send.opensNew": "(opens in a new tab)",
  "install.text": "Add Recount to your Home Screen: tap Share, then Add to Home Screen.",
  "install.dismiss": "Close this tip",

  // Sources
  "src.h": "Where these numbers come from",
  "src.bill": "Bill",
  "src.billClaude": "Read by Claude from the file you uploaded. Check names and amounts.",
  "src.billSample": "Sample bill, loaded from its source data.",
  "src.hospital": "Hospital data",
  "src.live": (v: { date: string }) => `Fetched live ${v.date}.`,
  "src.saved": (v: { date: string }) => `Saved lookup from ${v.date}, not fetched just now.`,
  "src.priceFile": "Price file",
  "src.priceLink": (v: { name: string }) => `${v.name}’s published standard charges`,
  "src.updated": (v: { date: string }) => `, updated ${v.date}`,
  "src.policy": "Assistance policy",
  "src.policyLink": (v: { name: string }) => `${v.name}’s financial assistance policy`,
  "src.noMatch": "We couldn’t match this hospital, so charges weren’t compared with its price list.",

  // The hospital's own policy, next to state law (bill page)
  "policy.headBreaks": (v: { name: string | null; n: number }) =>
    `Heads up: ${v.name ?? "the hospital"}’s own policy breaks ${v.n === 1 ? "a state rule" : `${v.n} state rules`}.`,
  "policy.headUnclear": (v: { name: string | null }) =>
    `Heads up: part of ${v.name ?? "the hospital"}’s own policy is unclear under state law.`,
  "policy.theirSays": (v: { doc: string }) => {
    const d: Record<string, string> = {
      charity_care: "charity care policy",
      discount_payment: "discount payment policy",
      debt_collection: "debt collection policy",
      application: "application form",
    };
    return `Their ${d[v.doc] ?? "policy"} says`;
  },
  "policy.likely": " (likely conflict)",
  "policy.ask": " (worth asking about)",
  "policy.pdf": "Policy PDF",
  "policy.policy": "Policy",
  "policy.page": (v: { n: number }) => `, page ${v.n}`,
  "policy.lawLabel": "California law:",
  "policy.foot": (v: { added: boolean; firm: number; total: number }) => {
    const verb = v.added ? "We’ve added " : "We’ll add ";
    if (v.firm === v.total) return verb + (v.firm === 1 ? "this to your letter. " : "these to your letter. ");
    return verb + `the ${v.firm === 1 ? "rule it breaks" : `${v.firm} rules it breaks`} to your letter. `;
  },
  "policy.seeOthers": "See what we found in other hospitals’ policies",
  "law.DEADLINE": "Hospitals can’t set a time limit for applying for financial assistance.",
  "law.ASSETS": "Hospitals can’t count your savings or other assets when deciding if you qualify.",
  "law.INCOME_PROOF": "Hospitals can only ask for recent pay stubs or tax returns as proof of income.",
  "law.CREDIT_REPORTING": "Hospitals can’t report this kind of medical debt to credit agencies.",
  "law.LIENS": "Hospitals can’t put a lien on a patient’s real property to collect.",
  "law.MEDICAL_FIRST": "Hospitals can’t make you apply for Medi-Cal or other coverage before they’ll consider you.",

  // Shared by the bill page and the audit
  "doc.effective": (v: { date: string | null }) => (v.date ? `effective ${v.date}` : "effective date not stated"),
  "doc.label": (v: { doc: DocKind | string }) => {
    const d: Record<string, string> = {
      charity_care: "Charity care policy",
      discount_payment: "Discount payment policy",
      debt_collection: "Debt collection policy",
      application: "Application form",
      application_discount: "Discount application form",
    };
    return d[v.doc] ?? "Policy";
  },
  "verdict.conflict": "conflicts with the law",
  "verdict.likely": "likely conflicts",
  "verdict.ask": "worth asking about",
  "verdict.none": "no conflicts found",
  "date.notStated": "date not stated",
  "place.county": (v: { county: string }) => `${v.county} County`,

  // Audit page
  "audit.loadFailed": "We couldn’t load the audit data.",
  "audit.loading": "Loading the statewide audit…",
  "audit.sample": "Sample data. These hospitals are made up; the real audit results will replace them.",
  "audit.eyebrow": (v: { date: string }) => `Hospital policy audit · ${v.date}`,
  "audit.scopeAll": (v: { checked: number; total: number }) =>
    `We read the financial assistance policies of every California hospital (${v.checked} of ${v.total}).`,
  "audit.scopeSf": "We read the financial assistance policies of San Francisco’s hospitals.",
  "audit.scopeSome": (v: { n: number }) => `We read the financial assistance policies of ${v.n} California hospitals.`,
  "audit.conflictTail": (v: { n: number }) => ` of them ${plural(v.n, "conflicts", "conflict")} with state law.`,
  "audit.likelyMore": (v: { n: number }) => ` ${v.n} more likely ${plural(v.n, "does", "do")}.`,
  "audit.likelyTail": (v: { n: number }) => ` of them likely ${plural(v.n, "conflicts", "conflict")} with state law.`,
  "audit.lede": (v: { checked: number; sf: boolean; listed: number | null }) =>
    `We checked the current charity care, discount, and debt collection policies of ${v.checked} ${v.sf ? "San Francisco hospitals" : "California hospitals"}${v.listed != null ? ` (of ${v.listed} listed)` : ""}, from the state’s hospital database, against the rules in force since 2025: no deadlines to apply, no asset tests, simple proof of income, no credit reporting, no liens on homes, no Medi-Cal-first requirement. Every flag quotes the policy next to the law.`,
  "audit.map": "Map",
  "audit.find": "Find your hospital",
  "audit.findPlaceholder": "Name, city, or county",
  "audit.noMatch": "No hospital by that name in our list.",
  "audit.tapDot": "Or tap a dot on the map.",
  "audit.mostFlags": "Most flags",
  "audit.checkedList": "Hospitals we checked",
  "audit.flags": (v: { n: number }) => `${v.n} ${plural(v.n, "flag", "flags")}`,
  "audit.noConflicts": "no conflicts found",
  "audit.rulesH": "What we found, rule by rule",
  "audit.rulesSub": "Number of hospitals with a policy that goes against each rule.",
  "audit.toAsk": (v: { n: number }) => ` +${v.n} to ask`,
  "audit.ruleCounts": (v: { conflict: number; likely: number }) => ` · ${v.conflict} conflict, ${v.likely} likely`,
  "audit.methodH": "How we did this",
  "audit.method1":
    "We took each hospital’s policy documents from the state’s hospital database (HCAI) and read them in full. When a sentence matched one of the rules above, we flagged it and reviewed it together with the text around it.",
  "audit.method2":
    "Flags are reviewed with the surrounding text; ‘likely’ and ‘worth asking’ are not legal conclusions. Policies change; we show each document’s effective date.",
  "audit.checkedAll": (v: { n: number }) => `Checked all ${v.n} hospitals in our list.`,
  "audit.checkedSome": (v: { checked: number; total: number }) => `Checked ${v.checked} of ${v.total} hospitals.`,
  "audit.dataFrom": (v: { date: string }) => ` Data from ${v.date}.`,

  // Map
  "map.aria": "Map of California hospitals, colored by what we found",
  "map.conflict": "conflicts",
  "map.likely": "likely conflicts",
  "map.ask": "worth asking",
  "map.none": "none found",

  // One hospital in the audit
  "hosp.unread": "We couldn’t read this hospital’s documents, so we can’t say either way.",
  "hosp.none": "No conflicts found in the documents we read.",
  "hosp.summary": (v: { bad: number; ask: number }) => {
    const { bad, ask } = v;
    const askPart = `${ask} ${ask === 1 ? "is" : "are"} worth asking about`;
    if (!bad) return `${ask} ${plural(ask, "part", "parts")} of its policies ${ask === 1 ? "is" : "are"} worth asking about.`;
    const badPart = `${bad} ${plural(bad, "part", "parts")} of its policies ${bad === 1 ? "goes" : "go"} against California law`;
    return ask ? `${badPart}, and ${askPart}.` : `${badPart}.`;
  },
  "hosp.theirSays": "Their policy says",
  "hosp.lawSays": "California law says",
  "hosp.seeRule": "See the rule text.",
  "hosp.docsRead": "Documents we read",
  "hosp.stateListing": "State listing",
  "hosp.checkBill": "Got a bill from this hospital? Check it",

  // Rule titles in the audit, by rule id (English matches findings.json)
  "rule.DEADLINE": "Puts a time limit on applying",
  "rule.ASSETS": "Counts the patient’s savings or assets",
  "rule.INCOME_PROOF": "Demands income proof beyond pay stubs or tax returns",
  "rule.CREDIT_REPORTING": "Reports hospital debt to credit bureaus",
  "rule.LIENS": "Allows liens on a patient’s home or property",
  "rule.MEDICAL_FIRST": "Requires applying for Medi-Cal or other coverage first",
  "audit.quotesNote": "Policy and law quotes are shown as written.",

  // My bills (saved on this device)
  "bills.link": "My bills",
  "bills.linkAria": (v: { n: number }) => `My bills, ${v.n} saved on this phone`,
  "bills.title": "Your bills",
  "bills.checkAnother": "Check another bill",
  "bills.checkFirst": "Check a bill",
  "bills.empty": "You haven’t checked a bill on this phone yet.",
  "bills.emptyHint": "When you check a bill, it will show up here so you can come back to it.",
  "bills.savedHere": "This list is saved only on this phone. On another phone or computer, open the bill’s link instead.",
  "bills.loading": "Loading your bills…",
  "bills.recentTitle": "Your recent bills",
  "bills.seeAll": (v: { n: number }) => (v.n > 3 ? `See all ${v.n} bills` : "See all your bills"),
  "bills.rowLoading": "Loading this bill…",
  "bills.untitled": "Hospital bill",
  "bills.visit": (v: { date: string }) => `Visit ${v.date}`,
  "bills.added": (v: { date: string }) => `Added ${v.date}`,
  "bills.billSays": "Bill says",
  "bills.open": "Open",
  "bills.status.reading": "Reading",
  "bills.status.needs_household": "Needs your answers",
  "bills.status.drafting": "Writing your letters",
  "bills.status.ready": "Letters ready",
  "bills.status.approved": "Approved, ready to send",
  "bills.status.error": "Couldn’t read",
  "bills.tier.FREE": "Likely free care",
  "bills.tier.DISCOUNT": "Likely discount",
  "bills.tier.NOT_ELIGIBLE": "Likely doesn’t qualify",
  "bills.flags": (v: { n: number }) => (v.n === 0 ? "No charges flagged" : v.n === 1 ? "1 charge flagged" : `${v.n} charges flagged`),
  "bills.gone": "No longer available",
  "bills.goneHint": "This bill was removed or can’t be opened.",
  "bills.remove": "Remove",
  "bills.removeFromPhone": "Remove from this phone",
  "bills.confirmText": "Remove this bill from the list on this phone? You can still open it again from its link.",
  "bills.confirmYes": "Yes, remove",
  "bills.confirmNo": "Keep it",
};

type En = typeof en;
export type Key = keyof En;
/** Keys whose text needs no variables. */
export type PlainKey = { [K in Key]: En[K] extends string ? K : never }[Key];
type Dict = { [K in Key]: En[K] extends (v: infer V) => string ? (v: V) => string : string };

const es: Dict = {
  "lang.group": "Idioma",
  footer:
    "Esto no es asesoría legal ni médica. Recount compara su factura con reglas y precios públicos. El hospital toma la decisión final.",

  "start.eyebrow": "Para facturas de sala de emergencias en San Francisco",
  "start.promise": "¿Tiene una factura del hospital que no puede pagar? Vamos a revisarla línea por línea, para ver si de verdad debe algo.",
  "start.lede":
    "Comparamos su factura con los precios que publica el propio hospital y con las reglas de atención caritativa de California. Después preparamos las cartas. Usted las lee y decide. No enviamos nada por usted.",
  "start.photo": "Tome una foto de su factura",
  "start.uploading": "Subiendo su factura…",
  "start.hint": "O elija una foto o un PDF que ya tenga. Si puede, use la página que muestra cada cargo.",
  "start.sample": "Probar con una factura de ejemplo",
  "start.sampleBusy": "Abriendo el ejemplo…",
  "start.uploadFailed": "No pudimos subir ese archivo. Revise su conexión e intente de nuevo.",
  "start.sampleFailed": "Algo salió mal al abrir el ejemplo. Intente de nuevo.",
  "start.how1": "Leemos cada línea y marcamos las que no coinciden con los números del propio hospital.",
  "start.how2": "Usted contesta tres preguntas sobre su hogar.",
  "start.how3": "Recibe una respuesta clara, la regla que la respalda y cartas listas para enviar.",

  "file.pdfTooBig": "Ese PDF es demasiado grande. Pruebe con una foto de la página con los cargos.",
  "file.notImage": "Elija una foto o un PDF de su factura.",
  "file.cantOpen": "No pudimos abrir esa foto. Tome una nueva, o guárdela primero como JPEG.",
  "file.tooLarge": "Esa foto es demasiado grande para enviarla. Tome una foto más de cerca, solo de los cargos.",

  "case.opening": "Abriendo su factura…",
  "case.notFound": "No encontramos esta factura.",
  "case.startAgain": "Empezar de nuevo",
  "case.cantRead": (v) => (v.pdf ? "No pudimos leer este archivo." : "No pudimos leer esta foto."),
  "case.tryAgain": "Intentar de nuevo",
  "case.details": "Detalles",
  "case.eyebrow": "Revisando",
  "case.reading": "Estamos revisando su factura, línea por línea.",
  "case.photoAlt": "Su factura",
  "case.log": "Lo que hizo Recount",
  "progress.label": "Su avance",
  "progress.of": (v: { n: number; total: number }) => `Paso ${v.n} de ${v.total}`,
  "progress.1": "Leemos su factura",
  "progress.2": "Usted responde 3 preguntas",
  "progress.3": "Usted revisa sus cartas",
  "progress.4": "Usted las envía",
  "progress.now1": "Estamos leyendo su factura. Tarda más o menos un minuto.",
  "progress.now2": "Vea lo que marcamos y luego responda las tres preguntas de abajo.",
  "progress.now3": "Lea su respuesta y sus cartas. Cambie lo que necesite y luego apruébelas.",
  "progress.now4": "Sus cartas están listas. Así puede enviarlas.",
  "case.err.unavailable": (v) =>
    `Nuestro lector de facturas no está disponible en este momento, así que no pudimos leer ${v.pdf ? "su archivo" : "su foto"}. Intente de nuevo en unos minutos. La factura de ejemplo de la página de inicio sí funciona.`,
  "case.err.notBill": (v) =>
    `Esto no parece una factura de hospital. Pruebe con ${v.pdf ? "un archivo" : "una foto"} de la página que muestra cada cargo.`,
  "case.err.generic": (v) =>
    v.pdf
      ? "Algo salió mal al leer su archivo. Intente de nuevo con un archivo claro de la página que muestra cada cargo."
      : "Algo salió mal al leer su foto. Intente de nuevo con una foto clara y derecha de la página que muestra cada cargo.",

  "step.starting": "Empezando…",
  "step.running": "en proceso",
  "step.done": "listo",
  "step.warn": "nota",
  "step.error": "problema",

  "answer.eyebrow": "La respuesta corta",
  "answer.freeLead": "Lo más probable es que usted deba",
  "answer.discount": "Lo más probable es que usted califique para un descuento.",
  "answer.askOffLead": "Pida que le quiten hasta",
  "answer.billSays": (v) => `La factura dice ${v.amount}. `,
  "answer.freeSub": "Según la política del propio hospital, su hogar califica para atención gratuita.",
  "answer.discountSub":
    "La ley estatal limita lo que le pueden cobrar a más o menos lo que pagaría un programa del gobierno. Casi siempre es mucho menos que esta factura.",
  "answer.alsoMarked": (v) => ` También marcamos hasta ${v.amount} en cargos que vale la pena cuestionar.`,
  "answer.why": "Por qué",
  "answer.mediStrong": "Revise también Medi-Cal.",
  "answer.mediBody": (v) =>
    `Con ingresos del ${v.pct}% del nivel federal de pobreza, es posible que califique. Medi-Cal puede pagar facturas de hasta tres meses antes de su solicitud. Solicítelo en`,
  "answer.mediTail": "o pregunte al consejero financiero del hospital.",

  "bill.h": "Su factura, revisada",
  "bill.srcClaude": "leída por Claude de su foto",
  "bill.srcSample": "datos de la factura de ejemplo",
  "bill.photoAlt": "La factura que usted subió",
  "bill.showLess": "Ver menos",
  "bill.tapSample": "La factura de ejemplo. Toque para verla completa",
  "bill.tapPhoto": "Su foto. Toque para verla completa",
  "bill.openFile": "Abrir el archivo que subió",
  "bill.stamp": (v) => `${v.n} ${plural(v.n, "cosa", "cosas")} que preguntar`,
  "bill.stampUpTo": (v) => ` · hasta ${v.amount}`,
  "bill.noName": "El nombre del hospital no aparece",
  "bill.patient": "Paciente",
  "bill.account": "Cuenta",
  "bill.visit": "Visita",
  "bill.statement": "Estado de cuenta",
  "bill.summary": "Factura resumida. Pida la detallada.",
  "bill.code": (v) => `código ${v.code}`,
  "bill.rev": (v) => `rev ${v.code}`,
  "bill.qty": (v) => `cant. ${v.n}`,
  "bill.dupThis": (v) => `¿igual a la línea ${v.line}? quite ${v.amount}`,
  "bill.dupOther": (v) => `se repite en la línea ${v.line}`,
  "bill.aboveList": (v) => `${v.amount} más que su propio precio de lista`,
  "bill.cashIs": (v) => `precio en efectivo: ${v.cash} por unidad`,
  "bill.askCash": "pida el precio en efectivo",
  "bill.total": "Total de cargos",
  "bill.insurancePaid": "Pagó el seguro",
  "bill.adjustments": "Ajustes",
  "bill.youPaid": "Usted pagó",
  "bill.owe": "Dicen que usted debe",
  "bill.totalNote": "las líneas no suman esto",
  "bill.noFindings":
    "No encontramos problemas en las líneas al compararlas con los precios publicados del hospital. La asistencia financiera todavía puede cubrir toda la factura.",
  "bill.confHigh": "Se basa en el número que publica el hospital.",
  "bill.confCheck": "Vale la pena preguntar. Puede haber una razón.",
  "bill.couldTakeOff": (v) => ` Le podrían quitar ${v.amount}.`,

  "hh.h": "Tres preguntas",
  "hh.lede":
    "Los hospitales de California tienen que dar atención gratuita o con descuento según el tamaño del hogar y los ingresos. Sus respuestas se quedan solo con esta factura.",
  "hh.needOop": "Nos falta un número: lo que usted ha pagado de su bolsillo en este hospital.",
  "hh.q1": "¿Cuántas personas hay en su hogar?",
  "hh.q1help": "Usted, más las personas que mantiene o con quienes declara impuestos.",
  "hh.fewer": "Una persona menos",
  "hh.more": "Una persona más",
  "hh.people": (v) => `${v.n} ${plural(v.n, "persona", "personas")}`,
  "hh.q2": "Más o menos, ¿cuánto gana su hogar en un año?",
  "hh.q2help": "Antes de impuestos. Un número aproximado está bien.",
  "hh.typeIncome": "Escriba un número, como 32000 o 32k.",
  "hh.smallIncome": (v) => `Eso es ${v.amount} al año. Si quiso decir miles, escriba ${v.n}k.`,
  "hh.perYear": (v) => `${v.amount} al año`,
  "hh.q3": "¿Tenía seguro médico en esta visita?",
  "hh.no": "No",
  "hh.yes": "Sí",
  "hh.oopLabel":
    "En los últimos 12 meses, ¿cuánto ha pagado o le han cobrado en este hospital, después del seguro? Incluya esta factura.",
  "hh.typeOop": "Escriba un número, como 4500 o 4.5k.",
  "hh.checking": "Revisando las reglas…",
  "hh.submit": "Ver mi respuesta",
  "hh.checkIncome": "revise la cantidad de ingresos",
  "hh.addIncome": "escriba su ingreso anual",
  "hh.answerIns": "conteste la pregunta del seguro",
  "hh.checkOop": "revise la cantidad que pagó de su bolsillo",
  "hh.addOop": "escriba lo que pagó de su bolsillo",
  "hh.missing": (v) => `Para continuar, ${v.list}.`,
  "hh.failed": "No se pudo enviar. Revise los números e intente de nuevo.",

  "letters.h": "Sus cartas",
  "letters.ready": "Listas para enviar",
  "letters.writing": "Escribiendo sus cartas…",
  "letters.srcClaude": "escritas por Claude",
  "letters.srcTemplate": "plantilla estándar",
  "letters.approvedNote":
    "Usted aprobó estas cartas. Recount no ha enviado nada. Envíelas usted por correo postal, correo electrónico o el portal de pacientes del hospital. Guarde una copia.",
  "letters.callFirst":
    "Primero llame a facturación. Pida la dirección postal o el correo electrónico para la asistencia financiera:",
  "letters.emailAssist": "Enviar por correo la solicitud de asistencia",
  "letters.emailDispute": "Enviar por correo las preguntas sobre cargos",
  "letters.lede": "Léalas. Corrija lo que esté mal y llene los [corchetes]. Nada sale hasta que usted lo envíe.",
  "letters.subject": "Asunto",
  "letters.bodyLabel": (v) => `Texto de: ${v.title}`,
  "letters.copy": "Copiar",
  "letters.copied": "Copiado",
  "letters.download": "Descargar .txt",
  "letters.saving": "Guardando…",
  "letters.approve": "Están bien. Aprobar",
  "letters.titleAssist": "Solicitud de asistencia financiera",
  "letters.titleDispute": "Preguntas sobre los cargos",
  "letters.sentInEnglish": "Esta es la carta en inglés que se envía al hospital.",
  "letters.patientCopyH": "Lo que dice su carta",
  "letters.patientCopyNote": "Solo para leer. Si cambia la carta en inglés de arriba, esta copia no cambia.",

  // Printing, the "how to send it" guide, and the home screen tip
  "print.one": "Imprimir o guardar como PDF",
  "print.all": "Imprimir todas las cartas",
  "print.brackets": "Llene los [corchetes] antes de imprimir, o escríbalos a mano en el papel.",
  "send.h": "Cómo enviar su carta",
  "send.intro": "Usted aprobó sus cartas. Recount no ha enviado nada. Siga estos pasos usted mismo, uno a la vez.",
  "send.step1H": "Llame a la oficina de facturación",
  "send.step1": "Pregunte (puede pedir un intérprete en español):",
  "send.step1Ask": "“¿A dónde mando una solicitud de asistencia financiera? ¿Hay un formulario?”",
  "send.inEnglish": "Si habla en inglés, diga:",
  "send.call": (v) => `Llamar al ${v.phone}`,
  "send.noPhone": "El teléfono de facturación está en su factura, casi siempre arriba o junto a “Questions?”.",
  "send.step2H": "Envíe su carta",
  "send.step2": "Mándela por correo postal, por correo electrónico o por el portal de pacientes del hospital. Guarde una copia.",
  "send.step2Mail": "Si la manda por correo postal, considere el correo certificado (certified mail) en la oficina de correos. Le dan un recibo que muestra que la recibieron.",
  "send.step3H": "Pida que paren el cobro",
  "send.step3": "Pida que pongan su cuenta en espera, para que no la manden a una agencia de cobranza mientras revisan su solicitud.",
  "send.step4H": "Anote cada llamada",
  "send.step4": "Anote la fecha, el nombre de la persona con quien habló y lo que le dijo.",
  "send.notesLabel": "Sus notas",
  "send.notesPlaceholder": "Ejemplo: Llamé a facturación. Hablé con María. Me dijo que mande el formulario a…",
  "send.notesSaved": "Se guardan solo en este teléfono.",
  "send.step5H": "Pida la asistencia financiera",
  "send.step5": "La ley de California le da derecho a pedir ayuda. El hospital tiene que darle su formulario de solicitud cuando usted lo pida.",
  "send.policyLink": "Lea la política de asistencia del hospital",
  "send.applicationLink": "Obtenga el formulario de solicitud del hospital",
  "send.opensNew": "(se abre en otra pestaña)",
  "install.text": "Agregue Recount a su pantalla de inicio: toque Compartir y luego Agregar a pantalla de inicio.",
  "install.dismiss": "Cerrar este consejo",

  "src.h": "De dónde salen estos números",
  "src.bill": "Factura",
  "src.billClaude": "Claude la leyó del archivo que usted subió. Revise los nombres y las cantidades.",
  "src.billSample": "Factura de ejemplo, cargada desde sus datos originales.",
  "src.hospital": "Datos del hospital",
  "src.live": (v) => `Consultados en vivo el ${v.date}.`,
  "src.saved": (v) => `Consulta guardada del ${v.date}. No se consultó ahora.`,
  "src.priceFile": "Lista de precios",
  "src.priceLink": (v) => `Cargos estándar publicados por ${v.name}`,
  "src.updated": (v) => `, actualizada el ${v.date}`,
  "src.policy": "Política de asistencia",
  "src.policyLink": (v) => `Política de asistencia financiera de ${v.name}`,
  "src.noMatch": "No pudimos identificar este hospital, así que no comparamos los cargos con su lista de precios.",

  "policy.headBreaks": (v) =>
    `Atención: la propia política ${v.name ? `de ${v.name}` : "del hospital"} no cumple con ${v.n === 1 ? "una regla estatal" : `${v.n} reglas estatales`}.`,
  "policy.headUnclear": (v) =>
    `Atención: una parte de la propia política ${v.name ? `de ${v.name}` : "del hospital"} no queda clara según la ley estatal.`,
  "policy.theirSays": (v) => {
    const d: Record<string, string> = {
      charity_care: "La política de atención caritativa",
      discount_payment: "La política de pago con descuento",
      debt_collection: "La política de cobro de deudas",
      application: "El formulario de solicitud",
    };
    return `${d[v.doc] ?? "La política"} del hospital dice`;
  },
  "policy.likely": " (probablemente no cumple)",
  "policy.ask": " (vale la pena preguntar)",
  "policy.pdf": "PDF de la política",
  "policy.policy": "Política",
  "policy.page": (v) => `, página ${v.n}`,
  "policy.lawLabel": "Ley de California:",
  "policy.foot": (v) => {
    const verb = v.added ? "Ya agregamos" : "Vamos a agregar";
    if (v.firm === v.total) return `${verb} ${v.firm === 1 ? "esto" : "estos puntos"} a su carta. `;
    return `${verb} a su carta ${v.firm === 1 ? "la regla que no cumple" : `las ${v.firm} reglas que no cumple`}. `;
  },
  "policy.seeOthers": "Vea lo que encontramos en las políticas de otros hospitales",
  "law.DEADLINE": "Los hospitales no pueden poner un plazo para solicitar asistencia financiera.",
  "law.ASSETS": "Los hospitales no pueden contar sus ahorros ni otros bienes para decidir si usted califica.",
  "law.INCOME_PROOF":
    "Como prueba de ingresos, los hospitales solo pueden pedir talones de pago recientes o declaraciones de impuestos.",
  "law.CREDIT_REPORTING": "Los hospitales no pueden reportar este tipo de deuda médica a las agencias de crédito.",
  "law.LIENS": "Los hospitales no pueden poner un gravamen sobre la casa o el terreno de un paciente para cobrar.",
  "law.MEDICAL_FIRST":
    "Los hospitales no pueden obligarle a solicitar Medi-Cal u otra cobertura antes de considerar su caso.",

  "doc.effective": (v) => (v.date ? `vigente desde el ${v.date}` : "sin fecha de vigencia"),
  "doc.label": (v) => {
    const d: Record<string, string> = {
      charity_care: "Política de atención caritativa",
      discount_payment: "Política de pago con descuento",
      debt_collection: "Política de cobro de deudas",
      application: "Formulario de solicitud",
      application_discount: "Formulario de solicitud de descuento",
    };
    return d[v.doc] ?? "Política";
  },
  "verdict.conflict": "no cumple con la ley",
  "verdict.likely": "probablemente no cumple",
  "verdict.ask": "vale la pena preguntar",
  "verdict.none": "sin conflictos",
  "date.notStated": "fecha no indicada",
  "place.county": (v) => `Condado de ${v.county}`,

  "audit.loadFailed": "No pudimos cargar los datos de la auditoría.",
  "audit.loading": "Cargando la auditoría estatal…",
  "audit.sample": "Datos de ejemplo. Estos hospitales son inventados. Los resultados reales de la auditoría los van a reemplazar.",
  "audit.eyebrow": (v) => `Auditoría de políticas de hospitales · ${v.date}`,
  "audit.scopeAll": (v) =>
    `Leímos las políticas de asistencia financiera de todos los hospitales de California (${v.checked} de ${v.total}).`,
  "audit.scopeSf": "Leímos las políticas de asistencia financiera de los hospitales de San Francisco.",
  "audit.scopeSome": (v) => `Leímos las políticas de asistencia financiera de ${v.n} hospitales de California.`,
  "audit.conflictTail": (v) => ` de ellos no ${plural(v.n, "cumple", "cumplen")} con la ley estatal.`,
  "audit.likelyMore": (v) =>
    v.n === 1 ? " Y es probable que otro más tampoco cumpla." : ` Y es probable que otros ${v.n} tampoco cumplan.`,
  "audit.likelyTail": (v) => ` de ellos probablemente no ${plural(v.n, "cumple", "cumplen")} con la ley estatal.`,
  "audit.lede": (v) =>
    `Revisamos las políticas actuales de atención caritativa, de descuento y de cobro de deudas de ${v.checked} ${v.sf ? "hospitales de San Francisco" : "hospitales de California"}${v.listed != null ? ` (de ${v.listed} en la lista)` : ""}, tomadas de la base de datos de hospitales del estado. Las comparamos con las reglas vigentes desde 2025: no hay plazo para solicitar, no se revisan los bienes, la prueba de ingresos es sencilla, no se reporta a las agencias de crédito, no hay gravámenes sobre la vivienda y no se exige solicitar Medi-Cal primero. Cada alerta cita la política junto a la ley.`,
  "audit.map": "Mapa",
  "audit.find": "Busque su hospital",
  "audit.findPlaceholder": "Nombre, ciudad o condado",
  "audit.noMatch": "No hay ningún hospital con ese nombre en nuestra lista.",
  "audit.tapDot": "O toque un punto en el mapa.",
  "audit.mostFlags": "Con más alertas",
  "audit.checkedList": "Hospitales que revisamos",
  "audit.flags": (v) => `${v.n} ${plural(v.n, "alerta", "alertas")}`,
  "audit.noConflicts": "sin conflictos",
  "audit.rulesH": "Lo que encontramos, regla por regla",
  "audit.rulesSub": "Número de hospitales con una política que va en contra de cada regla.",
  "audit.toAsk": (v) => ` +${v.n} para preguntar`,
  "audit.ruleCounts": (v) => ` · ${v.conflict} no ${plural(v.conflict, "cumple", "cumplen")}, ${v.likely} ${plural(v.likely, "probable", "probables")}`,
  "audit.methodH": "Cómo lo hicimos",
  "audit.method1":
    "Tomamos los documentos de política de cada hospital de la base de datos de hospitales del estado (HCAI) y los leímos completos. Cuando una frase coincidía con una de las reglas de arriba, la marcamos y la revisamos junto con el texto que la rodea.",
  "audit.method2":
    "Revisamos cada alerta con el texto que la rodea. “Probablemente” y “vale la pena preguntar” no son conclusiones legales. Las políticas cambian, por eso mostramos la fecha de vigencia de cada documento.",
  "audit.checkedAll": (v) => `Revisamos los ${v.n} hospitales de nuestra lista.`,
  "audit.checkedSome": (v) => `Revisamos ${v.checked} de ${v.total} hospitales.`,
  "audit.dataFrom": (v) => ` Datos del ${v.date}.`,

  "map.aria": "Mapa de los hospitales de California, con colores según lo que encontramos",
  "map.conflict": "no cumple",
  "map.likely": "probablemente no cumple",
  "map.ask": "vale la pena preguntar",
  "map.none": "sin conflictos",

  "hosp.unread": "No pudimos leer los documentos de este hospital, así que no podemos decir ni que sí ni que no.",
  "hosp.none": "No encontramos conflictos en los documentos que leímos.",
  "hosp.summary": (v) => {
    const { bad, ask } = v;
    if (!bad)
      return ask === 1
        ? "Vale la pena preguntar por una parte de sus políticas."
        : `Vale la pena preguntar por ${ask} partes de sus políticas.`;
    const badPart =
      bad === 1 ? "Una parte de sus políticas va en contra de la ley de California" : `${bad} partes de sus políticas van en contra de la ley de California`;
    if (!ask) return `${badPart}.`;
    return `${badPart}. También vale la pena preguntar por ${ask === 1 ? "otra parte" : `otras ${ask} partes`}.`;
  },
  "hosp.theirSays": "La política del hospital dice",
  "hosp.lawSays": "La ley de California dice",
  "hosp.seeRule": "Vea el texto de la regla.",
  "hosp.docsRead": "Documentos que leímos",
  "hosp.stateListing": "Registro estatal",
  "hosp.checkBill": "¿Tiene una factura de este hospital? Revísela",

  "rule.DEADLINE": "Pone un plazo para solicitar",
  "rule.ASSETS": "Cuenta los ahorros o bienes del paciente",
  "rule.INCOME_PROOF": "Pide más prueba de ingresos que talones de pago o declaraciones de impuestos",
  "rule.CREDIT_REPORTING": "Reporta la deuda del hospital a las agencias de crédito",
  "rule.LIENS": "Permite gravámenes sobre la casa o propiedad del paciente",
  "rule.MEDICAL_FIRST": "Exige solicitar Medi-Cal u otra cobertura primero",
  "audit.quotesNote": "Las citas de las políticas y de la ley están en inglés, tal como están escritas.",

  "bills.link": "Mis facturas",
  "bills.linkAria": (v) => `Mis facturas, ${v.n} ${plural(v.n, "guardada", "guardadas")} en este teléfono`,
  "bills.title": "Sus facturas",
  "bills.checkAnother": "Revisar otra factura",
  "bills.checkFirst": "Revisar una factura",
  "bills.empty": "Todavía no ha revisado ninguna factura en este teléfono.",
  "bills.emptyHint": "Cuando revise una factura, aparecerá aquí para que pueda volver a verla.",
  "bills.savedHere": "Esta lista se guarda solo en este teléfono. En otro teléfono o computadora, abra el enlace de la factura.",
  "bills.loading": "Cargando sus facturas…",
  "bills.recentTitle": "Sus facturas recientes",
  "bills.seeAll": (v) => (v.n > 3 ? `Ver las ${v.n} facturas` : "Ver todas sus facturas"),
  "bills.rowLoading": "Cargando esta factura…",
  "bills.untitled": "Factura del hospital",
  "bills.visit": (v) => `Visita del ${v.date}`,
  "bills.added": (v) => `Agregada el ${v.date}`,
  "bills.billSays": "La factura dice",
  "bills.open": "Abrir",
  "bills.status.reading": "Leyendo",
  "bills.status.needs_household": "Faltan sus respuestas",
  "bills.status.drafting": "Escribiendo sus cartas",
  "bills.status.ready": "Cartas listas",
  "bills.status.approved": "Aprobadas, listas para enviar",
  "bills.status.error": "No se pudo leer",
  "bills.tier.FREE": "Probable atención gratuita",
  "bills.tier.DISCOUNT": "Probable descuento",
  "bills.tier.NOT_ELIGIBLE": "Probablemente no califica",
  "bills.flags": (v) => (v.n === 0 ? "Ningún cargo marcado" : v.n === 1 ? "1 cargo marcado" : `${v.n} cargos marcados`),
  "bills.gone": "Ya no está disponible",
  "bills.goneHint": "Esta factura se borró o no se puede abrir.",
  "bills.remove": "Quitar",
  "bills.removeFromPhone": "Quitar de este teléfono",
  "bills.confirmText": "¿Quitar esta factura de la lista de este teléfono? Todavía puede abrirla con su enlace.",
  "bills.confirmYes": "Sí, quitar",
  "bills.confirmNo": "Dejarla",
};

const DICTS: Record<Lang, Dict> = { en, es };

type Args<K extends Key> = Dict[K] extends (v: infer V) => string ? [vars: V] : [];
export type T = <K extends Key>(key: K, ...args: Args<K>) => string;

/** Look up a UI string outside React (helpers that take `lang`). Components use useT(). */
export function translate<K extends Key>(lang: Lang, key: K, ...args: Args<K>): string {
  const entry = DICTS[lang][key] as string | ((v: unknown) => string);
  return typeof entry === "function" ? entry(args[0]) : entry;
}

/** "a and b" / "a, b y c" in the reader's language. */
export function joinList(lang: Lang, items: string[]) {
  return new Intl.ListFormat(locale(lang), { style: "long", type: "conjunction" }).format(items);
}
