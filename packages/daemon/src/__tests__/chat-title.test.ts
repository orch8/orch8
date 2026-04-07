import { describe, it, expect } from "vitest";
import { deriveChatTitle } from "../services/chat.service.js";

describe("deriveChatTitle", () => {
  it("uses the first non-empty line", () => {
    expect(deriveChatTitle("\n\nhello world")).toBe("Hello world");
  });

  it("capitalises the first letter", () => {
    expect(deriveChatTitle("create a qa agent")).toBe("Create a qa agent");
  });

  it("strips leading markdown punctuation", () => {
    expect(deriveChatTitle("# My big idea")).toBe("My big idea");
    expect(deriveChatTitle("- do the thing")).toBe("Do the thing");
    expect(deriveChatTitle("> quoted ask")).toBe("Quoted ask");
  });

  it("truncates long inputs and adds an ellipsis", () => {
    const long = "a".repeat(80);
    const title = deriveChatTitle(long);
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBe(61);
  });

  it("falls back to 'New chat' on empty input", () => {
    expect(deriveChatTitle("")).toBe("New chat");
    expect(deriveChatTitle("   \n  ")).toBe("New chat");
  });
});
