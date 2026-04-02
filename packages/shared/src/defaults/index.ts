export { parseAgentsMd, type ParsedAgentsMd } from "./agents-md-parser.js";

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the bundled defaults directory (skills/ and agents/) */
export const DEFAULTS_DIR = join(__dirname, "..", "..", "defaults");

/** Absolute path to the bundled skills directory */
export const DEFAULT_SKILLS_DIR = join(DEFAULTS_DIR, "skills");

/** Absolute path to the bundled agents directory */
export const DEFAULT_AGENTS_DIR = join(DEFAULTS_DIR, "agents");

/** Absolute path to the global (system-managed) skills directory */
export const GLOBAL_SKILLS_DIR = join(homedir(), ".orch8", "skills");
