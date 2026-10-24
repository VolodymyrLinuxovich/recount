# Spanish UI review, round 2

This round covers the new keys in `src/components/i18n/es.json` (landing., audit., nav., acct., hosp., found., flow., send., a11y., onboard., helper.), compared with `en.json`, plus `src/components/privacy/privacy.json`. I read a copy from Oct 24. Neither file was edited.

Overall the new Spanish is strong. It uses usted, the sentences are short, and the glossary is followed. Plural and select syntax is valid, and no keys are missing or extra (816 on each side). Two good additions go beyond the English: an interpreter tip in send.step1, and audit.quotesNote saying the quotes are in English.

The CRITICAL rows change meaning on the privacy page or blur money and eligibility. Fix those first.

## Terms to keep consistent (new this round)

| Concept | Use | Avoid |
|---|---|---|
| hashed password | contraseña guardada como código irreversible (hash) | contraseña cifrada (cifrar means encrypt, which can be undone) |
| conflicts with the law | no cumple con la ley | mixing "no cumple", "contradice" and "conflicto" on one page |
| sign out | cerrar sesión | salir (sounds like leaving the app) |
| apply (for assistance) | solicitar | pedir (it's the same verb as step 3's "pedir la pausa") |
| billed twice | Se cobró dos veces | Cobrado dos veces |
| the helper | Lupa, la ayudante de Recount | asistente (landing only) |
| household income | los ingresos de su hogar | sus ingresos, su ingreso anual |
| do it yourself | por su cuenta | usted mismo (masculine; most users of this flow are women helping family) |

## Suggestions, most important first

| key | current | suggested | why |
|---|---|---|---|
| privacy sections[3].p | …su contraseña cifrada con hash (nunca la contraseña misma)… | **CRITICAL** …su contraseña guardada como un código irreversible (hash), nunca la contraseña misma… | "Cifrada" means encrypted, which can be decrypted. A hash can't be reversed. The privacy page must say what we actually do. |
| privacy sections[6].p | …se borran su correo, su contraseña cifrada, sus datos… | **CRITICAL** …se borran su correo, el código de su contraseña (hash), sus datos… | Same problem. |
| acct.limitPrivacy | Guardamos su correo, su contraseña cifrada (con hash)… | **CRITICAL** Guardamos su correo, su contraseña como un código irreversible (hash)… | Same problem, on the sign-up screen. |
| privacy sections[1].p | Anthropic trata esos datos según sus propios términos comerciales y su política de retención. | **CRITICAL** Anthropic trata esos datos según los términos comerciales y la política de retención de Anthropic. | In usted Spanish, "sus" and "su" can read as *your* terms and *your* policy. That's the round 1 problem in a legal sentence. |
| privacy updated | Estos datos corresponden a cómo funciona la aplicación hoy. | **CRITICAL** Esta información describe cómo funciona la aplicación hoy. | On a privacy page, "estos datos" reads as "this personal data", not "these facts". |
| found.dupInsuredOwe | Si es un error, usted debería unos {amount}. | **CRITICAL** Si es un error, le quedarían por pagar unos {amount}. | "Debería" also means "you should owe", which reads like advice to pay. This line is about money. |
| flow.goBackIncome | Regrese y escriba su ingreso anual. | **CRITICAL** Regrese y escriba lo que ganan entre todos en su hogar al año. | Round 1 fixed hh.q2 to household income. This prompt sends people back with "su ingreso" (their own pay), which brings back the wrong-$0 risk. |
| landing.step4, landing.meter, landing.why | sus ingresos / Sus ingresos son el 125%… | los ingresos de su hogar / Los ingresos de su hogar son el 125%… | Same rule: eligibility uses household income. landing.why already says "de su hogar", so match it. |
| send.step4H, send.step4Btn, send.step4Done | Pida la asistencia financiera / Ya la pedí / Usted la pidió | Solicite la asistencia financiera / Ya la solicité / Usted la solicitó | Step 3's button is "Ya lo pedí", so the two buttons look almost the same. "Solicitar" also matches step4 ("solicitarla") and the hospital's form ("solicitud"). |
| acct.signOut, acct.signOutH | Salir | Cerrar sesión | "Salir" sounds like leaving the page. On a shared computer, someone may tap it, think they're done, and stay signed in. |
| acct.signOutLede | En una computadora compartida, salga cuando termine. | En una computadora compartida, cierre la sesión cuando termine. | Same reason. |
| acct.signedInAs | Entró como | Usando la cuenta | "Entró como" reads like "came in as", which is odd next to an email address. |
| audit.figLikely | más probablemente la {n, plural, one {contradice} other {contradicen}} | {n, plural, one {otro que probablemente tampoco cumple} other {otros que probablemente tampoco cumplen}} | Under the big number this reads "47 más probablemente la contradicen". That can mean "47 most likely contradict it", and "la" has nothing to point to. The audit names real hospitals, so it must not overstate. |
| audit.ruleSplit | {conflict} contradicen la ley, {likely} probablemente también | {conflict} no {conflict, plural, one {cumple} other {cumplen}} con la ley, {likely} probablemente tampoco | It shows "1 contradicen" when the count is 1. Also uses the shared term. |
| audit.lede, audit.what5 | …no hay gravámenes sobre la vivienda… / Sin gravámenes sobre la vivienda… | …no pueden usar la casa del paciente para cobrar (gravamen)… / Sin usar la casa del paciente para cobrar la deuda (gravamen), si califica para ayuda. | The glossary says to explain gravamen before naming it. These two lines still use it bare. |
| audit.what2 | Sin revisar sus ahorros u otros bienes. | Sin revisar los ahorros u otros bienes del paciente. | On a page about hospitals, "sus" can mean the hospital's savings. |
| audit.what6 | No se puede exigir que primero solicite Medi-Cal. | No se puede exigir al paciente que solicite Medi-Cal primero. | The verb has no subject, so it reads like it's talking to the reader. |
| audit.noConflicts, hosp.none, audit.conflictsN, audit.figConflict | sin conflictos / No encontramos conflictos / # contradicción / contradice la ley estatal | sin problemas con la ley / No encontramos nada que no cumpla con la ley / # no cumple / no cumple con la ley estatal | Three words for one idea on one page. "No cumple con la ley" is the plainest and is already used in audit.conflictTail and ruleCounts. |
| audit.likelyN, audit.likelyPlus | # probable(s) | # probablemente no cumple(n) | Round 1 issue again: "2 probables" doesn't say what is probable. If space is tight, "# posible(s)" is shorter and safer legally. |
| acct.deleteBillsOff | Sus facturas se quedan y solo se abren con sus enlaces privados. | Sus facturas no se borran. Solo se pueden abrir con sus enlaces privados. | "Se quedan" is a calque of "stay". In a delete dialog, say plainly what is and isn't deleted. |
| send.insuredHold | Pida a facturación que detenga la factura mientras lo hace. | Pida a facturación que ponga la factura en espera mientras apela. | Matches send.step3 ("en espera"). "Detener la factura" can sound like canceling it. |
| send.step3 | …para que no la manden a cobranza… | …para que no la manden a una agencia de cobranza… | "Mandar a cobranza" is jargon. Naming the agency is clearer for older readers. |
| landing.qAsk | ¿Cuántas personas viven en su hogar, incluyéndose usted? | ¿Cuántas personas viven en su hogar, contándose usted? | "Incluyéndose usted" is grammatically shaky. "Contándose usted" (or "cuéntese también") is what people say. |
| landing.twice | Cobrado dos veces | Se cobró dos veces | Match found.titleDup, so the demo and the real screen say the same thing. |
| landing.billed vs found.billed | Facturado / Cobrado | Cobrado in both | Same label, two words. |
| flow.whatWeFound | Lo que vimos | Lo que encontramos | Matches audit.foundH and the English. "Vimos" sounds casual and unsure. |
| landing.lupaRole | Asistente de Recount | Ayudante de Recount | Everywhere else Lupa is "la ayudante". |
| landing.step6, send.lede, landing.letterNote | …envíelas usted mismo / Haga estos pasos usted mismo / Usted mismo la envía | …envíelas por su cuenta / Haga estos pasos por su cuenta / Usted la envía por su cuenta | "Mismo" is masculine. "Por su cuenta" is neutral and already used in onboard.help3. Optional. |
| landing.free | Atención gratuita hasta 138% | Atención gratuita hasta el 138% | Spanish needs the article before percentages. landing.meter already has it. |
| landing.overList | Más que el precio de lista de $402 | Más que el precio de lista ($402) | "El precio de lista de $402" reads like a $402 list. |
| landing.qHelp | Esto decide qué reglas de atención gratuita le corresponden. | Con esto sabemos qué reglas de atención gratuita le corresponden. | "Esto decide" is a calque of "this decides". |
| found.flagNote | …encontramos algo que preguntar… | …encontramos algo que conviene preguntarle al hospital… | Matches flow.foundH from round 1. |
| hosp.unread | …así que no podemos decir ni que sí ni que no. | …así que no podemos decir si cumple con la ley o no. | Says what the yes or no is about. |
| hosp.summary.likely (one) | Probablemente # parte de sus políticas… | Probablemente una parte de sus políticas… | "Probablemente 1 parte" reads like a number on a form. conflict and ask already use "Una parte". |
| send.inEnglish | Si habla en inglés, diga: | En inglés, diga: | It labels the English script. It's not a condition. |
| send.allDoneH | Hizo todo lo que se puede por ahora. | Ya hizo todo lo que se puede por ahora. | "Ya" makes it sound finished and reassuring. Optional. |
| landing.h1a | Las facturas del hospital a menudo tienen errores. | Las facturas del hospital muchas veces tienen errores. | "Muchas veces" is plainer spoken Spanish. Optional. |
| onboard.need3 | Si tenía seguro médico en esta visita. | Si tenía seguro médico cuando fue al hospital. | "En esta visita" is a calque. Optional. |
| acct.show | Ver | Mostrar | Pairs with "Ocultar". Optional. |

## Checked and fine

nav.*, a11y.* (besides the above), onboard.* (besides need3), hosp.lede, hosp.notListedHint, flow.readFailed, flow.retakeBody, flow.detailsWho*, found.why*, found.titleAbove, found.listPrice, found.cashToo, send.step1 (the interpreter tip is a good addition), send.step2Mail, send.noPhone (keeping "Questions?" in English is right, since the bill is in English), audit.method1, audit.method2, audit.quotesNote, audit.conflictTail, audit.ruleCounts, helper.* (Lupa is "la ayudante automática" throughout), landing.letter*, landing.a1, acct.* (besides the above), and privacy sections 0, 2, 4 and 5.

One note on the English, not the Spanish: privacy section 4 says "We don't sell or share your information", but section 1 says the bill goes to Anthropic. Both languages say the same thing, so the Spanish is faithful. The English might want "We don't sell your information or share it beyond the services above".
