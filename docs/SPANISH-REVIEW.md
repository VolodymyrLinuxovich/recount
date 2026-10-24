# Spanish UI review

This review covers the `es` object in `src/components/i18n/strings.ts`, compared with `en` from a copy taken Oct 24, about 5:45 AM. The file was not edited.

Overall the Spanish is good. It uses usted throughout, the sentences are short, and the health terms are right (atención caritativa, asistencia financiera, nivel federal de pobreza, factura detallada, Medi-Cal). Most fixes are small. The four CRITICAL rows could mislead a patient about money or eligibility, so fix those first.

## Terms to use everywhere

| Concept | Use | Avoid |
|---|---|---|
| hospital's gross or list price | el precio de lista del hospital | su precio de lista (reads as the patient's price) |
| self-pay or cash price | precio para pacientes sin seguro (short form: precio sin seguro) | precio en efectivo (sounds like you must pay in bills) |
| household income | lo que ganan entre todos en su hogar | lo que gana su hogar |
| the helper | Lupa, la ayudante (feminine) | el ayudante |
| send | envíe / enviar (pick one; mande is fine but don't mix it with envíe on the same screen) | mixing both |
| where data is saved | este teléfono (or este navegador, but use the same word every time) | switching between the two |
| question a charge | cuestionar (already used most often) | mixing preguntar, cuestionar and quitar for the same action |

## Suggestions, most important first

| key | current | suggested | why |
|---|---|---|---|
| found.titleAbove | Le cobraron más que su propio precio de lista | **CRITICAL** Le cobraron más que el precio de lista del propio hospital | In usted Spanish, "su precio" means *your* price. The patient reads it as their own price, and the main point (the hospital broke its own published price) is lost. |
| found.listPrice | Su precio de lista | **CRITICAL** Precio de lista del hospital | Same problem: "su" points at the patient. |
| bill.aboveList | ${amount} más que su propio precio de lista | **CRITICAL** ${amount} más que el precio de lista del hospital | Same problem, shown on the bill line itself. |
| found.cashToo | Y como paga por su cuenta, su precio en efectivo publicado es aún más bajo: ${amount}. | **CRITICAL** Y como usted paga sin seguro, el hospital publica un precio aún más bajo para usted: ${amount}. | Two problems: "su precio" again, and "en efectivo" (see the next row). |
| found.titleCash, found.cashPrice, bill.colCash, bill.cashIs, bill.askCash, bill.cashGroupH | Hay un precio en efectivo más bajo / Precio en efectivo / precio en efectivo: ${cash} por unidad / pida el precio en efectivo / Puede pedir el precio en efectivo para ${n} servicios | **CRITICAL** Hay un precio más bajo para pacientes sin seguro / Precio sin seguro / precio sin seguro: ${cash} por unidad / pida el precio sin seguro / Puede pedir el precio sin seguro para ${n} servicios | "En efectivo" means paying with paper money. An older patient may think they must bring cash, or that paying by card or a payment plan loses the price. The English "cash price" means the self-pay price. |
| hh.q2 | Más o menos, ¿cuánto gana su hogar en un año? | **CRITICAL** Más o menos, ¿cuánto ganan entre todos en su hogar en un año? | "Gana su hogar" is a calque. Many people will type only their own pay. Eligibility uses total household income, so a low answer can wrongly show "you owe $0". |
| onboard.need2 | Más o menos cuánto gana su hogar al año. | Más o menos cuánto ganan entre todos en su hogar al año. | Same as hh.q2, shown before the questions. |
| hh.q2help | Antes de impuestos. Un número aproximado está bien. | Sume lo que ganan todos, antes de impuestos. Un número aproximado está bien. | Says plainly that it's a total. |
| helper.safety | El ayudante de Recount le explica su factura. No es consejo legal ni médico, y nunca envía nada por usted. | Lupa, la ayudante de Recount, le explica su factura. No es asesoría legal ni médica, y nunca envía nada por usted. | Everywhere else Lupa is "la ayudante". The footer says "asesoría", so use the same word. |
| bill.dupThis | ¿igual a la línea ${line}? quite ${amount} | ¿igual que la línea ${line}? pida que quiten ${amount} | "Quite" tells the patient to remove it, but only the hospital can. |
| send.progress | ${n} de ${total} hecho / hechos | ${n} de ${total} pasos listos | "1 de 4 hecho" doesn't agree with anything. Naming "pasos" fixes the agreement. |
| send.later | No pasa nada. Las líneas están ocupadas. Intente otra mañana. | No pasa nada. Muchas veces las líneas están ocupadas. Intente otro día por la mañana. | It states the lines *are* busy as a fact. "Otra mañana" can sound like "tomorrow". |
| send.email | Correo | Correo electrónico | "Correo" alone sits next to Imprimir and step2Mail (correo postal), so it's unclear which one it means. |
| hh.lede | …Sus respuestas se quedan solo con esta factura. | …Solo usamos sus respuestas para esta factura. | "Se quedan con" is a calque of "stay with" and sounds odd. |
| answer.eyebrow | La respuesta corta | En pocas palabras | Calque of "the short answer". "En pocas palabras" is the natural phrase. |
| a11y.open | Pantalla | Letra y colores | "Pantalla" (screen) doesn't tell anyone this button makes the text bigger. This button is for people who need it most. |
| law.LIENS | Los hospitales no pueden poner un gravamen sobre la casa o el terreno de un paciente para cobrar. | Los hospitales no pueden usar su casa o su terreno para cobrar la deuda (esto se llama gravamen). | "Gravamen" is a legal word many patients won't know. Explain it first and name it after. |
| rule.LIENS | Permite gravámenes sobre la casa o propiedad del paciente | Permite usar la casa del paciente para cobrar (gravamen) | Same reason, short form for the audit list. |
| hh.oopLabel | …Cuente médicos, farmacia, hospitales y esta factura. | …Incluya consultas médicas, medicinas, hospitales y esta factura. | "Cuente médicos" sounds like counting doctors. "Medicinas" is plainer than "farmacia". |
| answer.oopUnder | Sus gastos médicos de su bolsillo (${oop}) son menos del 10% de su ingreso (${income}). | Lo que pagó de su bolsillo por atención médica (${oop}) es menos del 10% de su ingreso (${income}). | "Sus … de su" repeats "su" and reads stiffly. |
| flow.foundH | Encontramos ${n} cosa(s) que puede preguntar | Encontramos ${n} cosa(s) que vale la pena preguntarle al hospital | "Que puede preguntar" sounds like permission. Say who they ask. |
| send.step3H | Pida que paren el cobro | Pida una pausa en el cobro | They ask for a hold while the hospital reviews, not for billing to stop. "Paren" overpromises. |
| send.step4 | La ley de California le da derecho a pedirla. … | La ley de California le da derecho a solicitarla. … | "Solicitar" is the word on the hospital forms (solicitud). It's the same verb the patient will hear on the phone. |
| helper.qCase1 | ¿Por qué debo $0? | ¿Por qué no debo nada? | Natural phrasing. "Debo $0" is a direct translation. |
| found.titleDup | Cobrado dos veces | Se cobró dos veces | A heading without a subject reads like a label. "Se cobró" is a full, plain sentence. Keep helper.qCase2 in step. |
| bill.couldTakeOff / answer.askOffLead | Le podrían quitar ${amount}. / Pida que le quiten hasta | Le podrían rebajar ${amount}. / Pida que le rebajen hasta | "Rebajar" is the usual word for taking money off a bill. "Quitar" also works, but "rebajar" is clearer about money. Optional. |
| letters.dSaved vs bills.savedHere vs send.notesSaved | este navegador / este navegador / este teléfono | Use one word everywhere (este teléfono is easier for most users) | Mixing the words makes people wonder if the data went to two places. |
| start.how1Title | Mande su factura | Envíe su factura | Elsewhere the app says "Envíe sus cartas". Pick one verb. |
| audit.ruleCounts | · ${conflict} no cumple(n), ${likely} probable(s) | · ${conflict} no cumple(n), ${likely} probablemente no | "5 probables" doesn't say what is probable. |
| audit.lede | (one long sentence listing all six rules) | Break into 3 sentences: what we read, the six rules, and that each alert quotes the policy | Too long to follow on a phone, especially at large text size. |
| onboard.skip | Saltar | Omitir | Both are fine. "Omitir" is the standard word on phones in Spanish. Optional. |
| bills.confirmNo | Dejarla | No, dejarla | Match case.deleteNo ("No, conservarla") so the two choices look alike. |
| hh.smallIncome / hh.typeIncome | …escriba ${n}k. / como 32000 o 32k | …escriba ${n}000. / como 32000 | Many older Spanish speakers don't use "k" for thousands. Only change this if the parser accepts plain thousands (it should already). |
| bill.noFindings | …La asistencia financiera todavía puede cubrir toda la factura. | …Aun así, la asistencia financiera puede cubrir toda la factura. | "Todavía" can read as "not yet". "Aun así" is the right meaning. |
| bill.rev | rev ${code} | cód. de ingreso ${code} | "rev" means nothing in Spanish. Optional, since few people read this column. |

## Checked and fine

These are correct, so no change is needed: footer, start.trust, case.privateBody, answer.discountSub, answer.discountNoAmount, answer.notEligible, answer.mediBody (good use of nivel federal de pobreza), all law.* entries except LIENS, send.step1Parent, send.step2Mail, hh.q1help (declara impuestos), the Spanish plurals in audit and hosp.summary, and letters.titleAssist and letters.titleDispute.
