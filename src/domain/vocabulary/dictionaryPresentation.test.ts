import { expect, test } from "vitest";
import { vocabularySensePresentation } from "./dictionaryPresentation";
const sense = {
  id: "sense",
  pos: "noun",
  definition: "[[animal]]",
  example: "",
  usage: "usually",
};
test("dictionary labels become relations, incomplete usage and wiki artifacts do not become examples", () => {
  const original = { ...sense, example: "Meronym: stock animal" };
  expect(vocabularySensePresentation(original)).toMatchObject({
    definition: "animal",
    example: "",
    usage: "",
    relations: [{ label: "Meronym", values: ["stock animal"] }],
  });
  expect(original.example).toBe("Meronym: stock animal");
});
test("real examples remain and labeled usage relations have display-only cleanup", () => {
  expect(
    vocabularySensePresentation({
      ...sense,
      example: "The farmer raised livestock.",
      usage: "Synonyms: [[cattle|cattle]], stock",
    }),
  ).toMatchObject({
    example: "The farmer raised livestock.",
    usage: "",
    relations: [{ label: "Synonyms", values: ["cattle", "stock"] }],
  });
});
