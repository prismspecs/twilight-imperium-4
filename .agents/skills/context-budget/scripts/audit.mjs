import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { estimateTokens, formatBytes } from './token-utils.mjs';

const HOME = os.homedir();
const CWD = process.cwd();

function safeRead(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8');
    }
  } catch {}
  return null;
}

function safeJson(filePath) {
  const content = safeRead(filePath);
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function getDirSize(dirPath) {
  let total = 0;
  if (!fs.existsSync(dirPath)) return 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += getDirSize(full);
      } else if (entry.isFile()) {
        try {
          total += fs.statSync(full).size;
        } catch {}
      }
    }
  } catch {}
  return total;
}

export function auditAntigravity() {
  const globalDir = path.join(HOME, '.gemini', 'config');
  const mcpFile = path.join(globalDir, 'mcp_config.json');
  const agentsFile = path.join(globalDir, 'AGENTS.md');
  const skillsDir = path.join(globalDir, 'skills');

  const mcpConfig = safeJson(mcpFile) || {};
  const mcpServers = mcpConfig.mcpServers || {};
  const agentsContent = safeRead(agentsFile) || '';

  const skills = [];
  if (fs.existsSync(skillsDir)) {
    try {
      const entries = fs.readdirSync(skillsDir);
      for (const name of entries) {
        const skillPath = path.join(skillsDir, name);
        const stat = fs.lstatSync(skillPath);
        const skillMd = path.join(skillPath, 'SKILL.md');
        const content = safeRead(skillMd) || '';
        skills.push({
          name,
          isSymlink: stat.isSymbolicLink(),
          bytes: content.length,
          tokens: estimateTokens(content),
        });
      }
    } catch {}
  }

  return {
    harness: 'Antigravity (agy)',
    globalMcpServers: Object.keys(mcpServers),
    rules: {
      file: agentsFile,
      bytes: agentsContent.length,
      tokens: estimateTokens(agentsContent),
    },
    skills,
    mcpFile,
  };
}

export function auditPi() {
  const piDir = path.join(HOME, '.pi', 'agent');
  const settingsFile = path.join(piDir, 'settings.json');
  const mcpFile = path.join(piDir, 'mcp.json');

  const settings = safeJson(settingsFile) || {};
  const mcpConfig = safeJson(mcpFile) || {};
  const packages = settings.packages || [];
  const mcpServers = Object.keys(mcpConfig.mcpServers || {});

  return {
    harness: 'Pi Harness',
    packages,
    mcpServers,
    compaction: settings.compaction || null,
    settingsFile,
    mcpFile,
  };
}

export function auditClaude() {
  const claudeDir = path.join(HOME, '.claude');
  const settingsFile = path.join(claudeDir, 'settings.json');
  const skillsDir = path.join(claudeDir, 'skills');

  const settings = safeJson(settingsFile) || {};
  const autoModeEnv = settings.autoMode?.environment || [];
  const autoModeStr = Array.isArray(autoModeEnv) ? autoModeEnv.join('\n') : String(autoModeEnv || '');
  const skillOverrides = settings.skillOverrides || {};
  const enabledPlugins = settings.enabledPlugins || {};

  const skills = [];
  if (fs.existsSync(skillsDir)) {
    try {
      const entries = fs.readdirSync(skillsDir);
      for (const name of entries) {
        const skillPath = path.join(skillsDir, name);
        const stat = fs.lstatSync(skillPath);
        const isOff = skillOverrides[name] === 'off';
        skills.push({
          name,
          isSymlink: stat.isSymbolicLink(),
          status: isOff ? 'disabled' : 'enabled',
        });
      }
    } catch {}
  }

  const projectsDir = path.join(claudeDir, 'projects');
  const projectsSize = getDirSize(projectsDir);

  return {
    harness: 'Claude Code',
    settingsFile,
    autoModeEnv: {
      itemsCount: Array.isArray(autoModeEnv) ? autoModeEnv.length : 0,
      bytes: autoModeStr.length,
      tokens: estimateTokens(autoModeStr),
    },
    skills,
    enabledPlugins: Object.keys(enabledPlugins),
    projectsHistorySize: projectsSize,
  };
}

export function auditOpenCode() {
  const opencodeDir = path.join(HOME, '.config', 'opencode');
  const configFile = path.join(opencodeDir, 'opencode.json');
  const agentsFile = path.join(opencodeDir, 'AGENTS.md');

  const config = safeJson(configFile) || {};
  const instructions = config.instructions || [];
  const agentsContent = safeRead(agentsFile) || '';

  return {
    harness: 'OpenCode',
    configFile,
    instructions,
    rules: {
      file: agentsFile,
      bytes: agentsContent.length,
      tokens: estimateTokens(agentsContent),
    },
  };
}

export function auditProject(projectDir = CWD) {
  const ruleFiles = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.cursorrules', 'NOT_FIXED.md'];
  const rules = [];

  for (const f of ruleFiles) {
    const full = path.join(projectDir, f);
    const content = safeRead(full);
    if (content !== null) {
      rules.push({
        filename: f,
        path: full,
        bytes: content.length,
        tokens: estimateTokens(content),
      });
    }
  }

  const projectSkills = [];
  const candidateDirs = [
    path.join(projectDir, '.agents', 'skills'),
    path.join(projectDir, '.claude', 'skills'),
  ];

  for (const sDir of candidateDirs) {
    if (fs.existsSync(sDir)) {
      try {
        const entries = fs.readdirSync(sDir);
        for (const name of entries) {
          const skillPath = path.join(sDir, name);
          const skillMd = path.join(skillPath, 'SKILL.md');
          const content = safeRead(skillMd) || '';
          projectSkills.push({
            name,
            dir: path.relative(projectDir, sDir),
            bytes: content.length,
            tokens: estimateTokens(content),
          });
        }
      } catch {}
    }
  }

  const mcpFiles = ['.mcp.json', '.claude/mcp.json', '.pi/mcp.json', '.cursor/mcp.json'];
  const localMcp = [];
  for (const mf of mcpFiles) {
    const full = path.join(projectDir, mf);
    const json = safeJson(full);
    if (json) {
      localMcp.push({ file: mf, servers: Object.keys(json.mcpServers || {}) });
    }
  }

  return {
    projectDir,
    rules,
    projectSkills,
    localMcp,
  };
}

export function evaluateFindings(agy, pi, claude, opencode, project) {
  const findings = [];

  // 1. Move from Global to Project Scope (MCP)
  const heavyGlobalMcp = ['blender', 'browser-control', 'browsermcp', 'docker', 'database', 'postgres'];
  const activeGlobalMcp = Array.from(new Set([...agy.globalMcpServers, ...pi.mcpServers]));

  for (const server of activeGlobalMcp) {
    if (heavyGlobalMcp.includes(server.toLowerCase())) {
      findings.push({
        severity: 'HIGH',
        category: 'Scope (Global -> Project)',
        title: `Domain-specific MCP Server "${server}" configured globally`,
        description: `"${server}" is declared in global config (~/.gemini or ~/.pi), loading dozens of tool definitions into EVERY agent turn regardless of project type.`,
        action: `Move "${server}" into project-level configuration (.mcp.json or .pi/mcp.json) only in repos that need it.`,
      });
    }
  }

  // 2. Project Context Leaking into Global Claude Settings
  if (claude.autoModeEnv.tokens > 300) {
    findings.push({
      severity: 'HIGH',
      category: 'Context Leakage',
      title: `Claude autoMode.environment contains ~${claude.autoModeEnv.tokens} tokens of resident context`,
      description: `~/.claude/settings.json has a large environment blob (e.g. Apply repository paths and credentials rules) injected into every session.`,
      action: `Move project-specific autoMode instructions into that project's CLAUDE.md or .claude/config instead of global ~/.claude/settings.json.`,
    });
  }

  // 3. Check System Prompt & Rules Size (> 1,000 tokens)
  for (const rule of project.rules) {
    if (rule.tokens > 1000) {
      findings.push({
        severity: 'MEDIUM',
        category: 'Prompt Size',
        title: `Project rule file "${rule.filename}" is ~${rule.tokens} tokens (> 1,000 tok limit)`,
        description: `Resident prompt files eat tokens on every turn. The Fast Triage Checklist advises keeping resident rules under ~1,000 tokens and referencing detailed specs on-demand.`,
        action: `Refactor "${rule.filename}": keep essential constraints resident, and link to docs/spec files using progressive disclosure.`,
      });
    }
  }

  // 4. Inactive or Bloated Skills
  const disabledClaudeSkills = claude.skills.filter((s) => s.status === 'disabled');
  if (disabledClaudeSkills.length > 5) {
    findings.push({
      severity: 'LOW',
      category: 'Dead Code / Manifest',
      title: `${disabledClaudeSkills.length} disabled skills in ~/.claude/skills/`,
      description: `Disabled skills still populate directory manifests and settings overrides.`,
      action: `Remove unused symlinks in ~/.claude/skills/ to keep skill manifests clean.`,
    });
  }

  // 5. Pi Compaction and Inspection
  const hasPiContext = pi.packages.some((p) => p.includes('pi-context'));
  if (!hasPiContext) {
    findings.push({
      severity: 'MEDIUM',
      category: 'Pi Instrumentation',
      title: `Pi Harness lacks context inspection & compaction extension`,
      description: `pi-context or pi-context-tools is not installed in ~/.pi/agent/settings.json.`,
      action: `Run 'pi install npm:pi-context' to enable /context dashboard and compaction tools.`,
    });
  }

  return findings;
}

export function runAudit(options = {}) {
  const agy = auditAntigravity();
  const pi = auditPi();
  const claude = auditClaude();
  const opencode = auditOpenCode();
  const project = auditProject(options.projectDir || CWD);

  const findings = evaluateFindings(agy, pi, claude, opencode, project);

  if (options.json) {
    console.log(JSON.stringify({ agy, pi, claude, opencode, project, findings }, null, 2));
    return;
  }

  const bold = (s) => `\x1b[1m${s}\x1b[0m`;
  const red = (s) => `\x1b[31m${s}\x1b[0m`;
  const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
  const green = (s) => `\x1b[32m${s}\x1b[0m`;
  const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
  const dim = (s) => `\x1b[2m${s}\x1b[0m`;

  console.log('\n' + bold('═══════════════════════════════════════════════════════════════'));
  console.log(bold('        CROSS-HARNESS CONTEXT BLOAT & BUDGET AUDIT            '));
  console.log(bold('═══════════════════════════════════════════════════════════════\n'));

  console.log(bold(cyan('▶ 1. GLOBAL HARNESS FOOTPRINT')));
  console.log(
    `  • ${bold('Antigravity (agy)')}: ${agy.globalMcpServers.length} global MCP servers [${agy.globalMcpServers.join(', ') || 'none'}], ` +
      `${agy.skills.length} global skills, rules: ~${agy.rules.tokens} tok`
  );
  console.log(
    `  • ${bold('Pi Harness')}: ${pi.packages.length} packages, ${pi.mcpServers.length} global MCP servers [${pi.mcpServers.join(', ') || 'none'}], ` +
      `compaction reserve: ${pi.compaction?.reserveTokens || 'default'} tok`
  );
  console.log(
    `  • ${bold('Claude Code')}: autoMode environment: ~${claude.autoModeEnv.tokens} tok (${claude.autoModeEnv.itemsCount} items), ` +
      `${claude.skills.length} skills (${claude.skills.filter((s) => s.status === 'disabled').length} disabled), ` +
      `history cache: ${formatBytes(claude.projectsHistorySize)}`
  );
  console.log(
    `  • ${bold('OpenCode')}: ${opencode.instructions.length} instruction files, rules: ~${opencode.rules.tokens} tok`
  );

  console.log('\n' + bold(cyan(`▶ 2. PROJECT FOOTPRINT (${path.basename(project.projectDir)})`)));
  if (project.rules.length === 0) {
    console.log('  • No resident rule files found.');
  } else {
    console.log('  • Resident Rules:');
    for (const r of project.rules) {
      const tokStr = r.tokens > 1000 ? red(`~${r.tokens} tok`) : green(`~${r.tokens} tok`);
      console.log(`    - ${bold(r.filename)}: ${tokStr} (${formatBytes(r.bytes)})`);
    }
  }

  if (project.projectSkills.length > 0) {
    console.log('  • Project Skills:');
    for (const s of project.projectSkills) {
      console.log(`    - ${bold(s.name)} [${s.dir}]: ~${s.tokens} tok`);
    }
  } else {
    console.log('  • Project Skills: None');
  }

  if (project.localMcp.length > 0) {
    console.log('  • Project-Scoped MCP:');
    for (const m of project.localMcp) {
      console.log(`    - ${m.file}: [${m.servers.join(', ')}]`);
    }
  } else {
    console.log('  • Project-Scoped MCP: None (all MCP servers currently run from global config)');
  }

  console.log('\n' + bold(cyan('▶ 3. FAST TRIAGE AUDIT FINDINGS')));
  if (findings.length === 0) {
    console.log(green('  ✔ No critical context bloat detected! Setup follows best practices.'));
  } else {
    for (let i = 0; i < findings.length; i++) {
      const f = findings[i];
      const badge =
        f.severity === 'HIGH' ? red('[HIGH]') : f.severity === 'MEDIUM' ? yellow('[MED]') : dim('[LOW]');
      console.log(`\n  ${bold(`${i + 1}. ${badge} ${f.title}`)}`);
      console.log(`     ${dim('Category:')} ${f.category}`);
      console.log(`     ${dim('Problem:')}  ${f.description}`);
      console.log(`     ${green('Fix:')}      ${f.action}`);
    }
  }

  console.log('\n' + bold('───────────────────────────────────────────────────────────────'));
  console.log(bold('Recommended Next Steps:'));
  console.log(`  1. Run ${cyan('token-meter audit')} to inspect historical session costs and bloated tool responses.`);
  console.log(`  2. In Pi, run ${cyan('/context')} to visualize real-time token allocation.`);
  console.log(`  3. Run ${cyan('context-budget proxy --port 8080')} to capture turn-0 request payloads directly.`);
  console.log(bold('═══════════════════════════════════════════════════════════════\n'));
}
