import { describe, expect, it } from "vitest";
import { OFF_TOPIC, TopicSchema, quickTopic, topicInput } from "../convex/lib/topic";

describe("Lupa topic gate (rules)", () => {
  it("lets greetings and thanks through", () => {
    for (const t of ["hi", "Hello!", "hey Lupa", "thanks", "Thank you so much!", "ok", "hola", "Buenos días", "gracias", "Muchas gracias, Lupa"]) expect(quickTopic(t), t).toBe("on");
  });

  it("lets bill questions through without a model call", () => {
    for (const t of [
      "Why do I owe $0?",
      "What is charity care?",
      "My insurance denied the claim, can I appeal?",
      "A collection agency keeps calling me",
      "Is my information safe with Recount?",
      "¿Qué pasa si no pago la factura?",
      "¿Pueden poner un gravamen en mi casa?",
      "Recibí una carta de cobro",
    ])
      expect(quickTopic(t), t).toBe("on");
  });

  it("sends everyday uses of bill words to the classifier", () => {
    for (const t of ["Write a cover letter for my job application", "How do I delete a file in Linux?", "What should my household budget be?"])
      expect(quickTopic(t), t).toBe("unsure");
  });

  it("refuses obvious off topic requests", () => {
    for (const t of [
      "Write me a short poem about cats",
      "What's the capital of France?",
      "integrate x^2",
      "write Python code to sort a list",
      "Tell me a joke",
      "¿Cuál es la capital de Francia?",
      "Escríbame un poema sobre gatos",
      "Ayúdeme con mi tarea de álgebra",
      "What's the weather today?",
    ])
      expect(quickTopic(t), t).toBe("off");
  });

  it("asks the classifier when a request mixes both", () => {
    expect(quickTopic("Write a poem about my hospital bill")).toBe("unsure");
    expect(quickTopic("translate this letter to Spanish")).toBe("unsure");
  });

  it("asks the classifier about short follow-ups", () => {
    expect(quickTopic("why?")).toBe("unsure");
    expect(quickTopic("what should I do next")).toBe("unsure");
  });

  it("treats an attachment without text as on topic", () => {
    expect(quickTopic("", true)).toBe("on");
    expect(quickTopic("what is this?", true)).toBe("unsure");
    expect(quickTopic("is this right?", true)).toBe("unsure");
    expect(quickTopic("write a poem about this picture", true)).toBe("unsure");
  });

  it("puts a crisis before everything, even an off topic request", () => {
    for (const t of [
      "I want to kill myself",
      "I can't pay this, I want to die",
      "write a poem, then I'm going to end my life",
      "suicide",
      "Quiero morir, no puedo pagar",
      "no quiero vivir",
      "Voy a hacerme daño",
    ])
      expect(quickTopic(t), t).toBe("crisis");
    expect(quickTopic("I died laughing at this bill")).not.toBe("crisis");
  });

  it("has a fixed refusal in both languages, with no dashes or emoji", () => {
    expect(OFF_TOPIC.en).toMatch(/hospital bills/);
    expect(OFF_TOPIC.es).toMatch(/facturas del hospital/);
    expect(OFF_TOPIC.es).toMatch(/le/); // usted forms: "ayudarle", "le gustaría"
    for (const s of Object.values(OFF_TOPIC)) {
      expect(s).not.toMatch(/[\u2013\u2014]| - /);
      expect(s).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it("builds a short, marked classifier input", () => {
    const input = topicInput([{ role: "user", content: "hi" }, { role: "assistant", content: "x".repeat(1000) }], "why?", true);
    expect(input).toContain('<new_message attachment="yes">');
    expect(input.length).toBeLessThan(800);
    expect(TopicSchema.safeParse({ onTopic: false, reason: "off_topic" }).success).toBe(true);
    expect(TopicSchema.safeParse({ onTopic: true, reason: "weather" }).success).toBe(false);
  });
});
