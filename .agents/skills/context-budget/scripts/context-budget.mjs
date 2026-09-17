#!/usr/bin/env node

/**
 * context-budget CLI
 * Unified cross-harness context bloat auditor, Turn-0 request inspection proxy, and compaction helper.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { runAudit } from './audit.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const command = args[0] || 'audit';

function printHelp() {
  console.log(`
Usage:
  context-budget [command] [options]

Commands:
  audit [--json]                     Run cross-harness context bloat & budget audit
  proxy [--port N] [--target URL]    Start the Turn-0 request inspection proxy
  meter [args...]                    Run token-meter (e.g. 'audit', 'stats 30')
  help                               Show this help message

Examples:
  context-budget audit
  context-budget proxy --port 8080 --target https://api.anthropic.com
  context-budget proxy --mock
  context-budget meter audit
`);
}

if (command === 'audit') {
  const jsonFlag = args.includes('--json');
  const dirArg = args.slice(1).find((a) => !a.startsWith('-'));
  const projectDir = dirArg ? path.resolve(dirArg) : process.cwd();
  runAudit({ json: jsonFlag, projectDir });
} else if (command === 'proxy') {
  const proxyScript = path.join(__dirname, 'proxy.mjs');
  const child = spawn(process.execPath, [proxyScript, ...args.slice(1)], {
    stdio: 'inherit',
  });
  child.on('exit', (code) => process.exit(code || 0));
} else if (command === 'meter') {
  const meterArgs = args.slice(1).length > 0 ? args.slice(1) : ['audit'];
  const child = spawn('token-meter', meterArgs, {
    stdio: 'inherit',
  });
  child.on('error', (err) => {
    console.error('Failed to run token-meter. Make sure it is installed (npm install -g @whdrnr2583/token-meter).', err.message);
  });
  child.on('exit', (code) => process.exit(code || 0));
} else if (command === 'help' || command === '--help' || command === '-h') {
  printHelp();
} else {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}
