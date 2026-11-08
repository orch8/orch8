import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { LogSearch } from "../components/pipeline/LogSearch.js";

describe("implementation log search", () => {
  it("finds actual log lines without treating a process exit as a test result", () => {
    render(<LogSearch content={"$ pnpm test\nFAIL src/item.test.ts\nexit code: 1\n$ pnpm build\nexit code: 0"} />);
    const search = screen.getByRole("searchbox", { name: "Find text in this run log" });
    fireEvent.change(search, { target: { value: "EXIT CODE" } });
    expect(screen.getByRole("status")).toHaveTextContent("2 matching lines");
    expect(screen.getByRole("status")).toHaveTextContent("Read surrounding output");
    const lines = screen.getAllByRole("listitem");
    expect(lines.map(line => line.textContent)).toEqual(["3exit code: 1", "5exit code: 0"]);
    fireEvent.change(search, { target: { value: "FAIL" } });
    expect(screen.getByRole("status")).toHaveTextContent("1 matching line");
    expect(within(screen.getByRole("listitem")).getByText(/FAIL src\/item/)).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "not present" } });
    expect(screen.getByRole("status")).toHaveTextContent("No matching lines");
  });

  it("bounds the rendered matches and reports the complete count", () => {
    render(<LogSearch content={Array.from({ length: 60 }, (_, n) => `test line ${n + 1}`).join("\n")} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "test" } });
    expect(screen.getByRole("status")).toHaveTextContent("60 matching lines; showing first 50");
    expect(screen.getAllByRole("listitem")).toHaveLength(50);
  });
});
