import { describe, expect, it } from "vitest";
import el from "./el.json";
import en from "./en.json";

type Messages = { [key: string]: string | Messages };

function keys(messages: Messages, prefix = ""): string[] {
  return Object.entries(messages).flatMap(([key, value]) =>
    typeof value === "string" ? [`${prefix}${key}`] : keys(value, `${prefix}${key}.`),
  );
}

/** Argument names: `{name}` and `{name, plural, ...}`, but not the text inside plural branches. */
const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)[,}]/g)].map((match) => match[1]).sort();

function lookup(messages: Messages, path: string): string {
  return path.split(".").reduce<string | Messages>((node, key) => (node as Messages)[key], messages) as string;
}

describe("message catalogues", () => {
  it("has every text in both English and Greek", () => {
    expect(keys(el).sort()).toEqual(keys(en).sort());
  });

  it("uses the same placeholders in both languages", () => {
    for (const key of keys(en)) {
      expect(placeholders(lookup(el, key)), key).toEqual(placeholders(lookup(en, key)));
    }
  });
});
