// Who does each part of Recount: fixed rules in our code, an AI model, or the patient.
// The app shows this on every bill, and each logged step carries the same "kind".
// Rule of the house: AI reads and writes words; it never decides money, eligibility or law,
// and it never sends anything.

export type Kind = "rule" | "ai" | "person";

export const PIPELINE: { key: string; kind: Kind; en: string; es: string }[] = [
  { key: "upload", kind: "person", en: "You take a photo of the bill", es: "Usted toma una foto de la factura" },
  { key: "read", kind: "ai", en: "AI reads the bill into lines and amounts", es: "La IA lee la factura en líneas y montos" },
  { key: "read-column", kind: "ai", en: "A second AI read copies only the charges column", es: "Una segunda lectura con IA copia solo la columna de cargos" },
  { key: "compare-reads", kind: "rule", en: "Code compares the two reads and asks you about any difference", es: "El código compara las dos lecturas y le pregunta si hay diferencias" },
  { key: "hospital", kind: "rule", en: "Code matches the hospital and loads its published prices", es: "El código identifica el hospital y carga sus precios publicados" },
  { key: "check", kind: "rule", en: "Code checks duplicates, list prices, cash prices and the total", es: "El código revisa duplicados, precios de lista, precios en efectivo y el total" },
  { key: "policy", kind: "rule", en: "Code looks up the statewide policy audit for this hospital", es: "El código busca la auditoría estatal de la política de este hospital" },
  { key: "household", kind: "person", en: "You answer 3 questions about your household", es: "Usted responde 3 preguntas sobre su hogar" },
  { key: "eligibility", kind: "rule", en: "Code applies California's charity care rules", es: "El código aplica las reglas de ayuda financiera de California" },
  { key: "letters", kind: "ai", en: "AI drafts the letters from those facts only", es: "La IA redacta las cartas solo con esos datos" },
  { key: "letters-check", kind: "rule", en: "Code checks every dollar amount in the letters against the bill", es: "El código revisa cada monto en dólares de las cartas contra la factura" },
  { key: "details", kind: "rule", en: "Code fills in your name and address", es: "El código llena su nombre y dirección" },
  { key: "approve", kind: "person", en: "You review, approve and send the letters yourself", es: "Usted revisa, aprueba y envía las cartas" },
  { key: "chat", kind: "ai", en: "Lupa, the AI helper, answers questions from your bill's facts", es: "Lupa, la ayudante con IA, responde preguntas con los datos de su factura" },
];

const KINDS = new Map(PIPELINE.map((p) => [p.key, p.kind]));

/** The kind of a logged step, by its key. Unknown keys are our own code. */
export function kindOf(key: string): Kind {
  return KINDS.get(key) ?? "rule";
}

/** What the AI is allowed to do. Anything not listed here is done by code or by the patient. */
export const AI_MAY = ["read the bill", "copy the charges column", "draft letter text from given facts", "answer questions"] as const;
export const AI_MAY_NOT = ["send anything", "decide eligibility", "compute or change amounts", "change findings", "approve letters"] as const;
