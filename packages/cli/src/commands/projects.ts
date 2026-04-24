import { Command } from "commander";
import type { OrcherClient } from "../client.js";

interface Project {
  id: string;
  name: string;
  slug: string;
  key: string;
  homeDir: string;
  active: boolean;
  budgetLimitUsd: string | null;
  budgetSpentUsd: string;
}

export function registerProjectCommands(
  program: Command,
  getClient: () => OrcherClient,
) {
  // orch projects list
  const projects = program
    .command("projects")
    .description("Manage projects");

  projects
    .command("list")
    .description("List all projects")
    .option("--json", "Output as JSON")
    .option("--active", "Only active projects")
    .action(async (opts) => {
      const client = getClient();
      const params = opts.active ? "?active=true" : "";
      const list = await client.get<Project[]>(`/projects${params}`);

      if (opts.json) {
        console.log(JSON.stringify(list, null, 2));
        return;
      }

      if (list.length === 0) {
        console.log("No projects found.");
        return;
      }

      console.log("Projects:");
      for (const p of list) {
        const status = p.active ? "" : " [archived]";
        const budget =
          p.budgetLimitUsd != null
            ? ` ($${p.budgetSpentUsd}/$${p.budgetLimitUsd})`
            : "";
        console.log(`  ${p.slug} [${p.key}] — ${p.name}${status}${budget}`);
      }
    });

  // orch projects create
  projects
    .command("create")
    .description("Create a new project")
    .requiredOption("--name <name>", "Project name")
    .requiredOption("--home <path>", "Git repo home directory")
    .option("--slug <slug>", "URL-safe slug (auto-generated from name)")
    .option("--key <KEY>", "Task key prefix, e.g. CAT")
    .option("--branch <branch>", "Default branch", "main")
    .option(
      "--finish-strategy <mode>",
      "How to integrate task work when done: pr | merge | none",
      "merge",
    )
    .option("--budget <usd>", "Budget limit in USD")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      const client = getClient();
      const slug =
        opts.slug ??
        opts.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

      const project = await client.post<Project>("/projects", {
        name: opts.name,
        slug,
        key: opts.key,
        homeDir: opts.home,
        defaultBranch: opts.branch,
        finishStrategy: opts.finishStrategy,
        budgetLimitUsd: opts.budget ? Number(opts.budget) : undefined,
      });

      if (opts.json) {
        console.log(JSON.stringify(project, null, 2));
      } else {
        console.log(`Created project "${project.name}" (${project.slug}, ${project.key})`);
      }
    });

  // orch project use <slug-or-id>
  const project = program
    .command("project")
    .description("Per-project operations");

  project
    .command("use <slug>")
    .description("Set active project context (prints project ID)")
    .option("--json", "Output as JSON")
    .action(async (slug, opts) => {
      const client = getClient();
      const list = await client.get<Project[]>("/projects");
      const found = list.find(
        (p) => p.slug === slug || p.id === slug,
      );
      if (!found) {
        console.error(`Project "${slug}" not found.`);
        process.exitCode = 1;
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify(found, null, 2));
      } else {
        console.log(`Active project: ${found.name} (${found.slug}, ${found.key})`);
        console.log(`  Home: ${found.homeDir}`);
      }
    });

  // orch project archive <slug-or-id>
  project
    .command("archive <slug>")
    .description("Archive a project (soft-delete, agents paused)")
    .option("--json", "Output as JSON")
    .action(async (slug, opts) => {
      const client = getClient();
      const list = await client.get<Project[]>("/projects");
      const found = list.find(
        (p) => p.slug === slug || p.id === slug,
      );
      if (!found) {
        console.error(`Project "${slug}" not found.`);
        process.exitCode = 1;
        return;
      }

      const archived = await client.post<Project>(
        `/projects/${found.id}/archive`,
        {},
      );

      if (opts.json) {
        console.log(JSON.stringify(archived, null, 2));
      } else {
        console.log(`Archived project "${archived.name}". Agents paused.`);
      }
    });
}
