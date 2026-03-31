import { describe, it, expect } from "vitest";
import { Command } from "commander";
import { OrcherClient } from "../client.js";
import { registerProjectCommands } from "../commands/projects.js";

describe("CLI command registration", () => {
  it("registers projects list command", () => {
    const program = new Command();
    const client = new OrcherClient("http://localhost:0");
    registerProjectCommands(program, () => client);

    const projects = program.commands.find((c) => c.name() === "projects");
    expect(projects).toBeDefined();

    const list = projects!.commands.find((c) => c.name() === "list");
    expect(list).toBeDefined();
  });

  it("registers projects create command", () => {
    const program = new Command();
    const client = new OrcherClient("http://localhost:0");
    registerProjectCommands(program, () => client);

    const projects = program.commands.find((c) => c.name() === "projects");
    const create = projects!.commands.find((c) => c.name() === "create");
    expect(create).toBeDefined();
  });

  it("registers project use command", () => {
    const program = new Command();
    const client = new OrcherClient("http://localhost:0");
    registerProjectCommands(program, () => client);

    const project = program.commands.find((c) => c.name() === "project");
    expect(project).toBeDefined();

    const use = project!.commands.find((c) => c.name() === "use");
    expect(use).toBeDefined();
  });

  it("registers project archive command", () => {
    const program = new Command();
    const client = new OrcherClient("http://localhost:0");
    registerProjectCommands(program, () => client);

    const project = program.commands.find((c) => c.name() === "project");
    const archive = project!.commands.find((c) => c.name() === "archive");
    expect(archive).toBeDefined();
  });
});
