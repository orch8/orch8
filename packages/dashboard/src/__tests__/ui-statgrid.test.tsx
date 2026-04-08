import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatGrid } from "../components/ui/StatGrid.js";

describe("StatGrid", () => {
  it("renders every cell with label and value", () => {
    render(
      <StatGrid
        items={[
          { label: "spend", value: "$4.82" },
          { label: "budget", value: "24%" },
          { label: "uptime", value: "2d" },
          { label: "queue", value: "3" },
        ]}
      />,
    );
    expect(screen.getByText("spend")).toBeInTheDocument();
    expect(screen.getByText("$4.82")).toBeInTheDocument();
    expect(screen.getByText("queue")).toBeInTheDocument();
  });

  it("renders the optional delta below the value", () => {
    render(
      <StatGrid items={[{ label: "spend", value: "$4.82", delta: "+12%" }]} />,
    );
    expect(screen.getByText("+12%")).toBeInTheDocument();
  });
});
