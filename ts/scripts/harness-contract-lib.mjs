import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

function finding(rule, file, message) {
  return { rule, severity: "error", file, message };
}

function validateForbiddenPaths(root, contract, findings) {
  for (const relativePath of contract.forbiddenPaths ?? []) {
    if (fs.existsSync(path.join(root, relativePath))) {
      findings.push(finding("RETIRED_EDITION_PATH", relativePath, "Retired edition content must not be restored."));
    }
  }
}

function walkFiles(root, options) {
  const directory = path.join(root, options.directory);
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(root, { ...options, directory: path.join(options.directory, entry.name) }));
    } else if (
      (!options.suffix || entry.name.endsWith(options.suffix))
      && (!options.basename || entry.name === options.basename)
    ) {
      files.push(path.relative(root, fullPath).replaceAll("\\", "/"));
    }
  }
  return files;
}

export function parseFrontmatter(content) {
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end < 0) return null;

  const data = {};
  let listKey = null;
  let blockScalarKey = null;
  let blockScalarStyle = null;
  for (const line of lines.slice(1, end)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const listMatch = line.match(/^\s+-\s+(.+?)\s*$/);
    if (listMatch && listKey) {
      data[listKey].push(listMatch[1]);
      continue;
    }
    if (blockScalarKey && /^\s+/.test(line)) {
      const value = line.replace(/^\s+/, "");
      const separator = data[blockScalarKey] === "" ? "" : blockScalarStyle === "|" ? "\n" : " ";
      data[blockScalarKey] += `${separator}${value}`;
      continue;
    }

    const fieldMatch = line.match(/^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/);
    if (!fieldMatch) {
      throw new Error(`Unsupported or malformed frontmatter line: ${line}`);
    }
    const [, key, rawValue = ""] = fieldMatch;
    if (Object.hasOwn(data, key)) throw new Error(`Duplicate frontmatter field: ${key}`);
    const value = rawValue.trim();
    if (value === "") {
      data[key] = [];
      listKey = key;
      blockScalarKey = null;
      blockScalarStyle = null;
    } else {
      const quote = value[0] === '"' || value[0] === "'" ? value[0] : null;
      if ((quote && value.at(-1) !== quote) || (!quote && (value.at(-1) === '"' || value.at(-1) === "'"))) {
        throw new Error(`Unbalanced quoted frontmatter value for '${key}'.`);
      }
      if (value === "|" || value === ">") {
        data[key] = "";
        blockScalarKey = key;
        blockScalarStyle = value;
      } else if (value.startsWith("[") || value.endsWith("]")) {
        if (!value.startsWith("[") || !value.endsWith("]")) {
          throw new Error(`Malformed inline sequence for '${key}'.`);
        }
        const inner = value.slice(1, -1).trim();
        data[key] = inner === "" ? [] : inner.split(",").map((item) => {
          const scalar = item.trim();
          const itemQuote = scalar[0] === '"' || scalar[0] === "'" ? scalar[0] : null;
          if ((itemQuote && scalar.at(-1) !== itemQuote) || (!itemQuote && (scalar.at(-1) === '"' || scalar.at(-1) === "'"))) {
            throw new Error(`Unbalanced quoted sequence item for '${key}'.`);
          }
          return itemQuote ? scalar.slice(1, -1) : scalar;
        });
        blockScalarKey = null;
        blockScalarStyle = null;
      } else {
        data[key] = quote ? value.slice(1, -1) : value;
        blockScalarKey = null;
        blockScalarStyle = null;
      }
      listKey = null;
    }
  }
  return data;
}

function readText(root, relativePath, findings, rule = "FILE_EXISTS") {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    findings.push(finding(rule, relativePath, "Required file does not exist."));
    return null;
  }
  return fs.readFileSync(fullPath, "utf8");
}

function validateFrontmatter(root, contract, findings, state) {
  for (const namespace of contract.frontmatterNamespaces ?? []) {
    const names = new Map();
    const files = walkFiles(root, namespace);
    if (files.length === 0) {
      findings.push(finding("FRONTMATTER_NAMESPACE_EMPTY", namespace.directory, `Namespace '${namespace.name}' has no files.`));
      continue;
    }

    state.namespaces.set(namespace.name, { files, names });
    for (const file of files) {
      const content = readText(root, file, findings);
      if (content === null) continue;
      let metadata;
      try {
        metadata = parseFrontmatter(content);
      } catch (error) {
        findings.push(finding("FRONTMATTER_INVALID", file, error.message));
        continue;
      }
      if (!metadata) {
        findings.push(finding("FRONTMATTER_INVALID", file, "Missing or unterminated frontmatter."));
        continue;
      }
      state.frontmatter.set(file, metadata);
      for (const field of namespace.requiredFields ?? []) {
        if (
          metadata[field] === undefined
          || metadata[field] === ""
          || (Array.isArray(metadata[field]) && metadata[field].length === 0)
        ) {
          findings.push(finding("FRONTMATTER_REQUIRED", file, `Required frontmatter field '${field}' is missing or empty.`));
        }
        if (namespace.toolField && !Array.isArray(metadata[namespace.toolField])) {
          findings.push(finding("FRONTMATTER_TOOL_LIST", file, `Tool field '${namespace.toolField}' must be a YAML list.`));
        }
      }

      if (metadata.name) {
        const prior = names.get(metadata.name);
        if (prior) {
          findings.push(finding("FRONTMATTER_NAME_UNIQUE", file, `Name '${metadata.name}' is already declared by ${prior}.`));
        } else {
          names.set(metadata.name, file);
        }
      }
    }
  }
}

function validateRolePolicies(root, contract, findings, state) {
  for (const policy of contract.rolePolicies ?? []) {
    const content = readText(root, policy.file, findings, "ROLE_FILE_EXISTS");
    if (content === null) continue;
    const metadata = state.frontmatter.get(policy.file);
    if (!metadata) {
      findings.push(finding("ROLE_FRONTMATTER_INVALID", policy.file, "Role policy target did not pass frontmatter validation."));
      continue;
    }

    const allowed = metadata.allowedTools ?? metadata.tools ?? [];
    const disallowed = metadata.disallowedTools ?? [];
    for (const tool of policy.requiredAllowedTools ?? []) {
      if (!allowed.includes(tool)) {
        findings.push(finding("ROLE_REQUIRED_TOOL", policy.file, `Required allowed tool '${tool}' is missing.`));
      }
    }
    for (const tool of policy.requiredDisallowedTools ?? []) {
      if (!disallowed.includes(tool)) {
        findings.push(finding("ROLE_REQUIRED_DENIAL", policy.file, `Required denied tool '${tool}' is missing.`));
      }
    }
    if (policy.exactTools) {
      const actual = [...allowed].sort();
      const expected = [...policy.exactTools].sort();
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        findings.push(finding(
          "ROLE_EXACT_TOOLS",
          policy.file,
          `Tool set changed. Expected [${expected.join(", ")}], received [${actual.join(", ")}].`,
        ));
      }
    }
  }
}

function validateMcpTools(root, contract, findings, state) {
  const config = contract.mcpTools;
  if (!config) return;
  const source = readText(root, config.registryFile, findings, "MCP_REGISTRY_EXISTS");
  if (source === null) return;
  const registered = new Set(
    [...source.matchAll(/registerMcpTool\(\s*server\s*,\s*["']([^"']+)["']/g)].map((match) => match[1]),
  );
  if (registered.size === 0) {
    findings.push(finding("MCP_REGISTRY_PARSE", config.registryFile, "No registerMcpTool declarations were found."));
    return;
  }

  for (const namespaceName of config.agentNamespaces ?? []) {
    const namespace = state.namespaces.get(namespaceName);
    if (!namespace) continue;
    for (const file of namespace.files) {
      const metadata = state.frontmatter.get(file);
      const tools = metadata?.allowedTools ?? metadata?.tools ?? [];
      for (const tool of tools) {
        if (tool.startsWith("ow-") && !registered.has(tool)) {
          findings.push(finding("MCP_TOOL_REFERENCE", file, `Tool '${tool}' is not registered in ${config.registryFile}.`));
        }
      }
    }
  }
  state.mcpTools = registered;
}

function validateAgentReferences(root, contract, findings, state) {
  const config = contract.agentReferences;
  if (!config) return;
  const namespace = state.namespaces.get(config.namespace);
  if (!namespace) return;
  const files = walkFiles(root, { directory: config.directory, suffix: ".md" });
  const escapedPrefix = config.prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const referencePattern = new RegExp(`${escapedPrefix}([a-z0-9-]+)`, "g");
  for (const file of files) {
    const content = readText(root, file, findings);
    if (content === null) continue;
    for (const match of content.matchAll(referencePattern)) {
      if (!namespace.names.has(match[1])) {
        findings.push(finding("AGENT_REFERENCE", file, `Referenced agent '${match[1]}' does not exist in ${config.namespace}.`));
      }
    }
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function normalizeMcpServers(value) {
  return JSON.stringify(canonicalize(value ?? {}));
}

function validatePluginManifests(root, contract, findings) {
  const config = contract.pluginManifests;
  if (!config) return;
  const marketplaceText = readText(root, config.marketplace, findings, "MARKETPLACE_EXISTS");
  if (marketplaceText === null) return;
  let marketplace;
  try {
    marketplace = JSON.parse(marketplaceText);
  } catch (error) {
    findings.push(finding("MARKETPLACE_JSON", config.marketplace, error.message));
    return;
  }
  const expectedSources = (config.plugins ?? []).map((plugin) => plugin.source).sort();
  const actualSources = (marketplace.plugins ?? []).map((plugin) => plugin.source).sort();
  if (JSON.stringify(actualSources) !== JSON.stringify(expectedSources)) {
    findings.push(finding(
      "MARKETPLACE_PLUGIN_SET",
      config.marketplace,
      `Plugin sources must exactly match the contract. Expected [${expectedSources.join(", ")}], received [${actualSources.join(", ")}].`,
    ));
  }

  for (const plugin of config.plugins ?? []) {
    const manifestText = readText(root, plugin.manifest, findings, "PLUGIN_MANIFEST_EXISTS");
    if (manifestText === null) continue;
    let manifest;
    try {
      manifest = JSON.parse(manifestText);
    } catch (error) {
      findings.push(finding("PLUGIN_MANIFEST_JSON", plugin.manifest, error.message));
      continue;
    }
    const marketplaceEntry = marketplace.plugins?.find((entry) => entry.source === plugin.source);
    if (!marketplaceEntry) {
      findings.push(finding("MARKETPLACE_PLUGIN_ENTRY", config.marketplace, `No plugin entry uses source '${plugin.source}'.`));
    } else {
      if (marketplaceEntry.name !== manifest.name) {
        findings.push(finding("MARKETPLACE_PLUGIN_NAME", config.marketplace, `Source '${plugin.source}' name does not match ${plugin.manifest}.`));
      }
      if (marketplaceEntry.version !== manifest.version) {
        findings.push(finding("MARKETPLACE_PLUGIN_VERSION", config.marketplace, `Source '${plugin.source}' version does not match ${plugin.manifest}.`));
      }
    }
    if (plugin.mcpMirror) {
      const mirrorText = readText(root, plugin.mcpMirror, findings, "MCP_MIRROR_EXISTS");
      if (mirrorText === null) continue;
      try {
        const mirror = JSON.parse(mirrorText);
        if (normalizeMcpServers(mirror.mcpServers) !== normalizeMcpServers(manifest.mcpServers)) {
          findings.push(finding("MCP_MANIFEST_MIRROR", plugin.mcpMirror, `mcpServers does not match ${plugin.manifest}.`));
        }
      } catch (error) {
        findings.push(finding("MCP_MIRROR_JSON", plugin.mcpMirror, error.message));
      }
    }
  }
}

function validateMarkers(root, contract, findings) {
  for (const markerContract of contract.markerContracts ?? []) {
    const content = readText(root, markerContract.file, findings, "MARKER_FILE_EXISTS");
    if (content === null) continue;
    let previous = -1;
    for (const marker of markerContract.ordered ?? []) {
      const index = content.indexOf(`<!-- ${marker} -->`);
      if (index < 0) {
        findings.push(finding("LIFECYCLE_MARKER_REQUIRED", markerContract.file, `Missing marker '${marker}'.`));
      } else if (index <= previous) {
        findings.push(finding("LIFECYCLE_MARKER_ORDER", markerContract.file, `Marker '${marker}' is out of order.`));
      } else {
        previous = index;
      }
    }
  }
}

function selectedFiles(root, config, side) {
  const base = path.join(root, config[side]);
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => (config.names ?? []).includes(name) || (config.extensions ?? []).some((extension) => name.endsWith(extension)))
    .sort();
}

function validateMirrors(root, contract, findings) {
  for (const config of contract.mirrorSets ?? []) {
    const sourceFiles = selectedFiles(root, config, "source");
    const mirrorFiles = selectedFiles(root, config, "mirror");
    if (JSON.stringify(sourceFiles) !== JSON.stringify(mirrorFiles)) {
      findings.push(finding(
        "MIRROR_FILE_SET",
        config.mirror,
        `File set differs from ${config.source}. Expected [${sourceFiles.join(", ")}], received [${mirrorFiles.join(", ")}].`,
      ));
      continue;
    }
    for (const name of sourceFiles) {
      const source = fs.readFileSync(path.join(root, config.source, name));
      const mirror = fs.readFileSync(path.join(root, config.mirror, name));
      if (!source.equals(mirror)) {
        findings.push(finding("MIRROR_CONTENT", `${config.mirror}/${name}`, `Content differs from ${config.source}/${name}.`));
      }
    }
  }

  for (const [sourceFile, mirrorFile] of contract.mirrorFiles ?? []) {
    const source = readText(root, sourceFile, findings, "MIRROR_SOURCE_EXISTS");
    const mirror = readText(root, mirrorFile, findings, "MIRROR_TARGET_EXISTS");
    if (source !== null && mirror !== null && source !== mirror) {
      findings.push(finding("MIRROR_CONTENT", mirrorFile, `Content differs from ${sourceFile}.`));
    }
  }
}

function validateSourcePolicies(root, contract, findings) {
  for (const policy of contract.sourcePolicies ?? []) {
    const content = readText(root, policy.file, findings, policy.id);
    if (content === null) continue;
    for (const required of policy.required ?? []) {
      if (!content.includes(required)) {
        findings.push(finding(policy.id, policy.file, `Required structural guard is missing: ${required}`));
      }
    }
    for (const forbidden of policy.forbidden ?? []) {
      if (content.includes(forbidden)) {
        findings.push(finding(policy.id, policy.file, `Forbidden structural pattern is present: ${forbidden}`));
      }
    }
  }
}

function visit(node, callback) {
  callback(node);
  node.forEachChild((child) => visit(child, callback));
}

function parseTypescript(root, policy, findings) {
  const content = readText(root, policy.file, findings, policy.id);
  if (content === null) return null;
  const sourceFile = ts.createSourceFile(policy.file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  for (const diagnostic of sourceFile.parseDiagnostics ?? []) {
    findings.push(finding(policy.id, policy.file, ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")));
  }
  return sourceFile;
}

function nameText(node) {
  return node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : null;
}

function validateDraftOnlyPrClient(sourceFile, policy, findings) {
  for (const interfaceName of policy.inputInterfaces ?? []) {
    const declaration = sourceFile.statements.find(
      (node) => ts.isInterfaceDeclaration(node) && node.name.text === interfaceName,
    );
    if (!declaration) {
      findings.push(finding(policy.id, policy.file, `Input interface '${interfaceName}' does not exist.`));
      continue;
    }
    if (declaration.members.some((member) => nameText(member.name) === "draft")) {
      findings.push(finding(policy.id, policy.file, `Input interface '${interfaceName}' exposes caller-controlled draft state.`));
    }
  }

  const prClass = sourceFile.statements.find(
    (node) => ts.isClassDeclaration(node) && node.name?.text === "PrClient",
  );
  if (!prClass) {
    findings.push(finding(policy.id, policy.file, "PrClient class does not exist."));
    return;
  }

  for (const methodName of policy.methods ?? []) {
    const method = prClass.members.find(
      (member) => ts.isMethodDeclaration(member) && nameText(member.name) === methodName,
    );
    if (!method?.body) {
      findings.push(finding(policy.id, policy.file, `Method '${methodName}' does not exist.`));
      continue;
    }
    let draftDeclarations = 0;
    let callerControlled = false;
    let draftAssignments = 0;
    let draftFlags = 0;
    let validDraftArguments = 0;
    let invalidArgumentMutation = false;
    let expectedExecution = false;
    visit(method.body, (node) => {
      if (
        ts.isVariableDeclaration(node)
        && nameText(node.name) === "draft"
      ) {
        draftDeclarations++;
        if (node.initializer?.kind !== ts.SyntaxKind.TrueKeyword) callerControlled = true;
      }
      if (
        ts.isBinaryExpression(node)
        && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && ts.isIdentifier(node.left)
        && node.left.text === "draft"
      ) {
        draftAssignments++;
      }
      if (
        ts.isPropertyAccessExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === "input"
        && node.name.text === "draft"
      ) {
        callerControlled = true;
      }
      if (
        ts.isElementAccessExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === "input"
        && ts.isStringLiteral(node.argumentExpression)
        && node.argumentExpression.text === "draft"
      ) {
        callerControlled = true;
      }
      if (
        ts.isVariableDeclaration(node)
        && node.initializer
        && ts.isIdentifier(node.initializer)
        && node.initializer.text === "input"
        && ts.isObjectBindingPattern(node.name)
        && node.name.elements.some((element) => nameText(element.name) === "draft")
      ) {
        callerControlled = true;
      }
      if (ts.isArrayLiteralExpression(node)) {
        for (let index = 0; index < node.elements.length - 1; index++) {
          const flag = node.elements[index];
          const value = node.elements[index + 1];
          if (ts.isStringLiteral(flag) && flag.text === "--draft") {
            draftFlags++;
            if (
              ts.isCallExpression(value)
              && ts.isIdentifier(value.expression)
              && value.expression.text === "String"
              && value.arguments.length === 1
              && ts.isIdentifier(value.arguments[0])
              && value.arguments[0].text === "draft"
            ) {
              validDraftArguments++;
            }
          }
            }
          }
          if (
            ts.isCallExpression(node)
            && ts.isPropertyAccessExpression(node.expression)
            && ts.isIdentifier(node.expression.expression)
            && node.expression.expression.text === "azArgs"
          ) {
            const operation = node.expression.name.text;
            const allowedWorkItemPush = operation === "push"
              && node.arguments.length === 2
              && ts.isStringLiteral(node.arguments[0])
              && node.arguments[0].text === "--work-items"
              && ts.isPropertyAccessExpression(node.arguments[1])
              && ts.isIdentifier(node.arguments[1].expression)
              && node.arguments[1].expression.text === "input"
              && node.arguments[1].name.text === "workItems";
            if (operation !== "join" && !allowedWorkItemPush) invalidArgumentMutation = true;
          }
          if (
            ts.isBinaryExpression(node)
            && (ts.isElementAccessExpression(node.left) || ts.isPropertyAccessExpression(node.left))
            && ts.isIdentifier(node.left.expression)
            && node.left.expression.text === "azArgs"
          ) {
            invalidArgumentMutation = true;
          }
          if (
            ts.isVariableDeclaration(node)
            && node.initializer
            && ts.isIdentifier(node.initializer)
            && node.initializer.text === "azArgs"
          ) {
            invalidArgumentMutation = true;
          }
          if (
            methodName === "createPr"
            && ts.isCallExpression(node)
            && node.expression.getText(sourceFile) === "execCmd"
            && node.arguments[0]?.getText(sourceFile) === "azCmd"
          ) {
            expectedExecution = true;
          }
          if (
            methodName === "updatePr"
            && ts.isCallExpression(node)
            && node.expression.getText(sourceFile) === "execFileCmd"
          ) {
            if (
              node.arguments.length >= 2
              && node.arguments[0].getText(sourceFile) === '"az"'
              && node.arguments[1].getText(sourceFile) === "azArgs"
            ) {
              expectedExecution = true;
            }
          }
    });
    if (draftDeclarations !== 1) {
      findings.push(finding(policy.id, policy.file, `Method '${methodName}' must define exactly one draft constant.`));
    }
    if (callerControlled) {
      findings.push(finding(policy.id, policy.file, `Method '${methodName}' does not keep draft as the literal true.`));
    }
    if (draftAssignments > 0) {
      findings.push(finding(policy.id, policy.file, `Method '${methodName}' reassigns its draft constant.`));
    }
    if (draftFlags !== 1 || validDraftArguments !== 1) {
      findings.push(finding(policy.id, policy.file, `Method '${methodName}' must pass exactly one true draft constant to --draft.`));
    }
    if (invalidArgumentMutation) {
      findings.push(finding(policy.id, policy.file, `Method '${methodName}' mutates or aliases azArgs outside the allowed work-item append.`));
    }
    if (!expectedExecution) {
      findings.push(finding(policy.id, policy.file, `Method '${methodName}' does not execute the validated argument path.`));
    }
  }
}

function validateForbiddenProperties(sourceFile, policy, findings) {
  const forbidden = new Set(policy.properties ?? []);
  visit(sourceFile, (node) => {
    if (
      (ts.isPropertyAssignment(node) || ts.isPropertySignature(node) || ts.isPropertyDeclaration(node))
      && forbidden.has(nameText(node.name))
    ) {
      findings.push(finding(policy.id, policy.file, `Forbidden property '${nameText(node.name)}' is present at offset ${node.pos}.`));
    }
    if (ts.isPropertyAccessExpression(node) && forbidden.has(node.name.text)) {
      findings.push(finding(policy.id, policy.file, `Forbidden property access '${node.name.text}' is present at offset ${node.pos}.`));
    }
  });
}

function validateNoPrCommentWrite(sourceFile, policy, findings) {
  let falseInitializer = false;
  visit(sourceFile, (node) => {
    if (
      ts.isVariableDeclaration(node)
      && nameText(node.name) === "commentPosted"
      && node.initializer?.kind === ts.SyntaxKind.FalseKeyword
    ) {
      falseInitializer = true;
    }
    if (
      ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isIdentifier(node.left)
      && node.left.text === "commentPosted"
      && node.right.kind === ts.SyntaxKind.TrueKeyword
    ) {
      findings.push(finding(policy.id, policy.file, "commentPosted is assigned true."));
    }
    if (
      (ts.isStringLiteral(node)
        || ts.isNoSubstitutionTemplateLiteral(node)
        || ts.isTemplateHead(node)
        || ts.isTemplateMiddle(node)
        || ts.isTemplateTail(node))
      && node.text.includes("/threads")
    ) {
      findings.push(finding(policy.id, policy.file, "A PR thread endpoint is present in the attachment writer."));
    }
  });
  if (!falseInitializer) {
    findings.push(finding(policy.id, policy.file, "commentPosted must be initialized to the literal false."));
  }
}

function validateTypescriptPolicies(root, contract, findings) {
  for (const policy of contract.typescriptPolicies ?? []) {
    const sourceFile = parseTypescript(root, policy, findings);
    if (!sourceFile) continue;
    if (policy.kind === "draft-only-pr-client") {
      validateDraftOnlyPrClient(sourceFile, policy, findings);
    } else if (policy.kind === "forbid-property") {
      validateForbiddenProperties(sourceFile, policy, findings);
    } else if (policy.kind === "no-pr-comment-write") {
      validateNoPrCommentWrite(sourceFile, policy, findings);
    } else {
      findings.push(finding("TYPESCRIPT_POLICY_KIND", policy.file, `Unknown TypeScript policy kind '${policy.kind}'.`));
    }
  }
}

function validateCommandPolicies(root, contract, findings) {
  for (const policy of contract.commandPolicies ?? []) {
    const content = readText(root, policy.file, findings, policy.id);
    if (content === null) continue;
    const start = content.indexOf(`<!-- ${policy.startMarker} -->`);
    const end = content.indexOf(`<!-- ${policy.endMarker} -->`, start + 1);
    if (start < 0 || end < 0 || end <= start) {
      findings.push(finding(policy.id, policy.file, "Command policy markers are missing or out of order."));
      continue;
    }
    const shellBlocks = [...content.slice(start, end).matchAll(/```(?:bash|sh)\s*\n([\s\S]*?)```/g)].map((match) => match[1]);
    const invocations = shellBlocks.flatMap((block) => {
      const logicalLines = block.replace(/\\\r?\n/g, " ").split(/\r?\n/);
      return logicalLines.flatMap((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return [];
        const tokens = trimmed.match(/"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\s]+/g) ?? [];
        const normalized = tokens.map((token) => (
          (token.startsWith('"') && token.endsWith('"'))
          || (token.startsWith("'") && token.endsWith("'"))
            ? token.slice(1, -1)
            : token
        ));
        if (normalized[0] !== "node") return [];
        const optionsWithValues = new Set([
          "-r",
          "--require",
          "--loader",
          "--import",
          "--conditions",
          "--inspect-port",
          "--diagnostic-dir",
          "--redirect-warnings",
        ]);
        let scriptIndex = 1;
        while (scriptIndex < normalized.length && normalized[scriptIndex].startsWith("-")) {
          const option = normalized[scriptIndex];
          if (["-e", "--eval", "-p", "--print", "-c", "--check"].includes(option)) return [];
          if (option === "--") {
            scriptIndex++;
            break;
          }
          scriptIndex += optionsWithValues.has(option) ? 2 : 1;
        }
        if (scriptIndex >= normalized.length) return [];
        return [{ tokens: normalized, scriptIndex }];
      });
    });
    for (const command of policy.commands ?? []) {
      const matches = invocations.filter(({ tokens, scriptIndex }) => (
        tokens[scriptIndex].includes(command.contains)
      ));
      if (matches.length !== 1) {
        findings.push(finding(policy.id, policy.file, `Expected exactly one node invocation of '${command.contains}', found ${matches.length}.`));
        continue;
      }
      for (const argument of command.requiredArgs ?? []) {
        if (!matches[0].tokens.includes(argument)) {
          findings.push(finding(policy.id, policy.file, `Command '${command.contains}' is missing required argument '${argument}'.`));
        }
      }
    }
  }
}

export function validateHarnessContract({ repoRoot, contract }) {
  const root = path.resolve(repoRoot);
  const findings = [];
  const state = {
    frontmatter: new Map(),
    namespaces: new Map(),
    mcpTools: new Set(),
  };
  validateForbiddenPaths(root, contract, findings);
  validateFrontmatter(root, contract, findings, state);
  validateRolePolicies(root, contract, findings, state);
  validateMcpTools(root, contract, findings, state);
  validateAgentReferences(root, contract, findings, state);
  validatePluginManifests(root, contract, findings);
  validateMarkers(root, contract, findings);
  validateMirrors(root, contract, findings);
  validateTypescriptPolicies(root, contract, findings);
  validateCommandPolicies(root, contract, findings);
  validateSourcePolicies(root, contract, findings);
  return findings;
}
