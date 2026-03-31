#!/usr/bin/env node
import { Command } from "commander";
import { OrcherClient } from "./client.js";
import { registerProjectCommands } from "./commands/projects.js";

const program = new Command();
program
  .name("orch")
  .description("Orch8 CLI — manage projects, agents, and tasks")
  .version("0.0.1")
  .option(
    "--api <url>",
    "Daemon API base URL",
    "http://localhost:3847/api",
  );

const client = new OrcherClient(
  program.opts().api ?? "http://localhost:3847/api",
);

registerProjectCommands(program, client);

program.parse();
