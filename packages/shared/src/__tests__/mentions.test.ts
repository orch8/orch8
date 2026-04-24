import { describe, expect, it } from "vitest";
import { extractMentionSlugs } from "../parsers/mentions.js";

describe("extractMentionSlugs", () => {
  it("extracts one mention", () => {
    expect(extractMentionSlugs("@alice please look")).toEqual(["alice"]);
  });

  it("extracts multiple mentions and dedupes in first-seen order", () => {
    expect(extractMentionSlugs("@alice @bob @alice")).toEqual(["alice", "bob"]);
  });

  it("skips inline code spans", () => {
    expect(extractMentionSlugs("ping `@alice` and @bob")).toEqual(["bob"]);
  });

  it("skips fenced blocks", () => {
    expect(extractMentionSlugs("before @alice\n```ts\n@bob\n```\nafter @carol")).toEqual(["alice", "carol"]);
  });

  it("skips indented code blocks", () => {
    expect(extractMentionSlugs("    @alice\n@bob")).toEqual(["bob"]);
  });

  it("skips email-like and mid-word matches", () => {
    expect(extractMentionSlugs("hi foo@alice and x@bob")).toEqual([]);
  });

  it("accepts trailing punctuation", () => {
    expect(extractMentionSlugs("Thanks @alice.")).toEqual(["alice"]);
  });

  it("rejects file-path-like and doubled-at matches", () => {
    expect(extractMentionSlugs("./@alice @@bob @carol")).toEqual(["carol"]);
  });

  it("accepts a 64-character slug", () => {
    const slug = "a".repeat(64);
    expect(extractMentionSlugs(`@${slug}`)).toEqual([slug]);
  });

  it("does not partially match longer slugs", () => {
    expect(extractMentionSlugs(`@${"a".repeat(65)}`)).toEqual([]);
  });

  it("rejects a leading dash", () => {
    expect(extractMentionSlugs("@-alice @bob")).toEqual(["bob"]);
  });
});
