import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "../components/ui/Card.js";

describe("Card", () => {
  it("renders title and meta in the header", () => {
    render(
      <Card title="qa-bot" meta="AGENT">
        <p>body</p>
      </Card>,
    );
    expect(screen.getByText("qa-bot")).toBeInTheDocument();
    expect(screen.getByText("AGENT")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("renders without a meta line", () => {
    render(<Card title="Plain card">x</Card>);
    expect(screen.getByText("Plain card")).toBeInTheDocument();
  });
});
