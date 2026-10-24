# Spanish UI review, round 3

This round covers the keys added since round 2 in `src/components/i18n/es.json`, compared with `en.json`: how.*, who.*, amt.*, the new acct.* keys, letters.flagged and letters.dDobPick. I read a copy from Oct 24 and didn't edit it.

Overall the new Spanish is good. It uses usted throughout, the sentences are short, and the round 2 fixes stuck: "Cerrar sesión", "Usando la cuenta" and the hash wording in acct.limitPrivacy. No keys are missing or extra. Plural syntax is valid. Two choices beat the English: acct.rowDob uses "Fecha de nacimiento" where the English says "Birthday", which fits a letter better, and how.s7.p uses "lo que ganan al año", which follows the household-income rule.

There are three CRITICAL rows covering two problems. In the first, two list items say the opposite of what they mean. In the second, a sentence says the State of California did our audit.

## Terms to keep consistent (new this round)

| Concept | Use | Avoid |
|---|---|---|
| AI | inteligencia artificial (IA) the first time on a page, then IA | IA alone at first mention (many older readers don't know the abbreviation) |
| charity care | atención caritativa (already in law.*, doc.*, audit.*) | ayuda financiera for the state rules (keep that for "financial assistance" in general) |
| statewide audit (ours) | nuestra revisión de los hospitales de California | auditoría estatal (reads as an audit by the state government) |
| "AI may never" list items | a positive verb after "nunca puede": Enviar cartas, Calcular montos | nada / ningún inside a list item (alone it reads as "send nothing") |

## Suggestions, most important first

| key | current | suggested | why |
|---|---|---|---|
| how.mayNot1 | Enviar nada | **CRITICAL** Enviar cartas u otros documentos | Under the heading the full sentence is fine ("nunca puede enviar nada"). But people scan a list item on its own, and "Enviar nada" reads as "send nothing", the opposite of what we mean. On the trust page that's the worst place for it. |
| how.mayNot3 | Calcular o cambiar ningún monto | **CRITICAL** Calcular o cambiar montos | Same problem. "Cambiar ningún monto" read alone says "change no amount". |
| how.s6.p | La auditoría estatal usó IA una sola vez, sin conexión, para revisar frases. | **CRITICAL** En nuestra revisión de los hospitales de California, la IA revisó las frases una sola vez, por adelantado. | "Auditoría estatal" means an audit done by the state. The English means our own audit of hospitals across the state. The sentence must not claim the government did it. "Sin conexión" means "without internet", so "por adelantado" (ahead of time, not during your visit) is closer to "offline" here. |
| how.lede | El dinero y si usted califica siempre los deciden reglas fijas. La IA solo lee… | Los montos y si usted califica siempre se deciden con reglas fijas. La inteligencia artificial (IA) solo lee… | "El dinero… los deciden" is clumsy. "Los montos" is the word used across the app. This is also the first use of IA on the page, so spell it out once. |
| how.s8.p | Las reglas de ayuda financiera de California, escritas como cálculos. | Las reglas de atención caritativa de California, escritas como cálculos. | Glossary term. law.* and audit.* already use "atención caritativa". |
| how.s9.p | Tiene prohibido agregar leyes, montos o nombres. | Le pedimos que no agregue leyes, montos ni nombres. | The English says "it is told not to". "Prohibido" sounds like a guarantee. The guarantee comes from the checks afterwards (letters.flagged and the approval step), so don't overclaim here. |
| letters.flagged | Por favor compare {list} en esta carta con su factura. No pudimos encontrarlo en su factura ni en nuestras revisiones. Cámbielo o bórrelo si está mal. | Por favor, compare {list} en esta carta con su factura. No pudimos confirmar estos datos con su factura ni con nuestras revisiones. Cámbielos o bórrelos si están mal. | {list} is often two or more items, so the singular "lo" is wrong. "No pudimos encontrarlo en su factura" can also sound like the item isn't on the bill at all. The English means "we couldn't match it". |
| how.s10.p | …y revisa que no falte nada antes de que pueda aprobar. | …y revisa que no falte nada obligatorio antes de que pueda aprobar. | The English says "nothing required". Optional blanks don't block approval. |
| how.limitsH | Lo que la IA puede hacer | Lo que la IA tiene permitido hacer | The section lists both what it may and may never do. "Tiene permitido" matches "allowed". |
| how.s1.p | Lo que no puede leer con claridad se lo mostramos para que lo revise. | Lo que no puede leer bien aparece en una lista para que usted lo revise. | Smoother, and keeps the English "is listed". |
| who.ai | {n, plural, =0 {Ningún uso de IA} one {# uso de IA, abajo} other {# usos de IA, abajo}} | {n, plural, =0 {No se usó IA} one {Se usó IA # vez (vea abajo)} other {Se usó IA # veces (vea abajo)}} | "# uso de IA, abajo" reads like a fragment. "Ningún uso de IA" is stiff. |
| amt.neither | ¿Ninguno de los dos? Toque el monto en la lista de abajo para escribirlo. | ¿No es ninguno de los dos? Toque el monto en la lista de abajo y escriba el correcto. | "Para escribirlo" means "to write it", the wrong amount. The point is to type the right one. |
| amt.h | Por favor revise un monto / # montos | Por favor, revise un monto / # montos | Comma after "Por favor", as in acct.errExists and acct.errGoogle. Same for letters.flagged. |
| acct.errGoogle | Este correo entra con Google. Por favor, use Continuar con Google. | Esta cuenta entra con Google. Por favor, toque «Continuar con Google». | An email doesn't sign in, an account does. Quote the button name so it reads as a button. |
| acct.otherPassword | También tiene una cuenta con este correo que entra con contraseña. Las facturas… | Con este correo también tiene otra cuenta, que entra con contraseña. Las facturas… | In the current order, "que entra" can attach to "correo". Same fix for acct.otherGoogle ("…otra cuenta, que entra con Google."). |
| acct.noForgot | …Sus facturas en este teléfono se siguen abriendo desde Mis facturas. | …Puede seguir abriendo las facturas de este teléfono desde Mis facturas. | Active voice, easier to read. |
| acct.googleFailed | …o use su correo abajo. | …o use su correo aquí abajo. | Small, reads more naturally. |
| acct.signIn, acct.tabSignIn, acct.signInBtn, acct.toSignIn | Entrar | Optional: Iniciar sesión / Iniciar sesión con este correo | "Entrar" is simple and fine for older users. Only change it if you want a pair with "Cerrar sesión". If you change it, change all four plus acct.viaGoogle and acct.viaEmail ("Inició sesión con…") together. |

## Checked and fine

acct.limitPrivacy (hash wording), acct.deleteBillsOn/Off, acct.claimed, acct.rowDob, acct.signedInAs, acct.signOut*, amt.q, amt.why, how.legend.*, how.s2.p, how.s3.*, how.s5.p, how.s7.p, how.s11.p, how.why1 to why4, how.modelsLede, who.task.*, who.backup, who.failed, letters.dDobPick.
