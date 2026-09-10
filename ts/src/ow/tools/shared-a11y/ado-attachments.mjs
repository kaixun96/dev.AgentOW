// Generated from kaixun96/dev.A11yAssist@aa78521e19bd9a69ffc6ad0a00e21f8bc230e546:native/ado-attachments.mjs. Do not edit; use ts/scripts/sync-a11y-capabilities.mjs.
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { preparePrDescriptionUpdate } from './pr-description.mjs';

function demand(condition, message) { if (!condition) throw new Error(message); }

function prUrl(configuration, prId) {
  const organization = new URL(configuration.organization);
  demand(organization.protocol === 'https:' && !organization.username && !organization.password &&
    !organization.search && !organization.hash, 'Expected an HTTPS ADO organization URL without credentials or query');
  demand(typeof configuration.project === 'string' && configuration.project.trim() &&
    typeof configuration.repositoryId === 'string' && configuration.repositoryId.trim(), 'ADO project and repository are required');
  demand(Number.isSafeInteger(prId) && prId > 0, 'Expected a positive PR ID');
  return `${organization.href.replace(/\/$/, '')}/${encodeURIComponent(configuration.project)}` +
    `/_apis/git/repositories/${encodeURIComponent(configuration.repositoryId)}/pullRequests/${prId}`;
}

function descriptionAppend(input, uploaded) {
  const sections = [input.appendToDescription, input.commentMarkdown].filter(text => text?.trim()).map(text => text.trim());
  const template = sections.length ? sections.join('\n\n') :
    (uploaded.length ? '## Visual Validation Attachments\n\n' + uploaded.map(({ name }) => `- [${name}]({{${name}}})`).join('\n') : '');
  return uploaded.reduce((text, { name, url }) => text.split(`{{${name}}}`).join(url), template);
}

async function responseJson(response, operation) {
  // Service bodies can contain tenant data or authentication diagnostics.
  demand(response.ok, `${operation} failed (HTTP ${response.status}); no automatic mutation retry`);
  return response.json();
}

/**
 * Publish attachments to an existing Draft PR. Authentication and workflow
 * approval belong to the caller. This does not evaluate the attached evidence.
 */
export async function attachPrEvidence(configuration, input, options = {}) {
  const commentPosted = false;
  const baseUrl = prUrl(configuration, input.prId);
  demand(typeof configuration.authorization === 'string' && configuration.authorization.trim(),
    'An ephemeral ADO authorization header is required');
  demand(Array.isArray(input.attachments), 'Expected an attachment array');
  const names = new Set();
  for (const attachment of input.attachments) {
    demand(typeof attachment.name === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(attachment.name),
      'Attachment names must be plain file names');
    demand(!names.has(attachment.name), 'Duplicate attachment name');
    names.add(attachment.name);
    demand(typeof attachment.localPath === 'string' && isAbsolute(attachment.localPath), 'Attachment path must be absolute');
    demand((await stat(attachment.localPath)).isFile(), 'Attachment must be a file');
    demand(attachment.sha256 === undefined || /^[a-f0-9]{64}$/.test(attachment.sha256), 'Invalid attachment SHA-256');
  }
  for (const field of ['commentMarkdown', 'appendToDescription']) {
    demand(input[field] === undefined || typeof input[field] === 'string', `Invalid ${field}`);
  }
  if (input.expectedHead !== undefined) demand(/^[a-f0-9]{40}$/.test(input.expectedHead), 'Invalid expected HEAD');
  const fetchImpl = options.fetchImpl ?? fetch;
  const readFetch = options.readFetch ?? fetchImpl;
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000);
  const headers = { Authorization: configuration.authorization };
  const url = `${baseUrl}?api-version=7.0`;
  async function readPr() {
    const pr = await responseJson(await readFetch(url, { headers, signal, redirect: 'error' }), 'Read PR');
    demand(pr.pullRequestId === input.prId && pr.isDraft === true && pr.status === 'active',
      'Publication requires the exact active Draft PR');
    demand(typeof pr.lastMergeSourceCommit?.commitId === 'string' &&
      /^[a-f0-9]{40}$/.test(pr.lastMergeSourceCommit.commitId), 'Live PR source HEAD is unavailable');
    return pr;
  }
  const initial = await readPr();
  const expectedHead = input.expectedHead ?? initial.lastMergeSourceCommit.commitId;
  demand(initial.lastMergeSourceCommit.commitId === expectedHead, 'Live PR HEAD does not match requested evidence');
  const uploaded = [];
  const organization = new URL(configuration.organization);
  for (const attachment of input.attachments) {
    const bytes = await readFile(attachment.localPath);
    const expectedHash = createHash('sha256').update(bytes).digest('hex');
    if (attachment.sha256) demand(expectedHash === attachment.sha256,
      'Attachment bytes no longer match the requested SHA-256');
    options.log?.(`Uploading ${attachment.name} (${bytes.length} bytes) to PR #${input.prId}`);
    const result = await responseJson(await fetchImpl(
      `${baseUrl}/attachments/${encodeURIComponent(attachment.name)}?api-version=7.0`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array(bytes), signal, redirect: 'error'
      }), 'Upload attachment');
    demand(typeof result.url === 'string', 'ADO did not return an attachment URL');
    const mediaUrl = new URL(result.url);
    demand(mediaUrl.origin === organization.origin && !mediaUrl.username && !mediaUrl.password &&
      !mediaUrl.hash && mediaUrl.pathname.startsWith(`${organization.pathname.replace(/\/$/, '')}/`),
      'ADO returned an unexpected attachment URL; reconcile the upload before continuing');
    const downloaded = await readFetch(mediaUrl.href, { headers, signal, redirect: 'error' });
    demand(downloaded.ok && downloaded.body, `Attachment readback failed (HTTP ${downloaded.status}); reconcile the upload`);
    const downloadedHash = createHash('sha256');
    let downloadedBytes = 0;
    for await (const chunk of downloaded.body) {
      downloadedBytes += chunk.length;
      demand(downloadedBytes <= bytes.length, 'Uploaded attachment readback exceeds the original size');
      downloadedHash.update(chunk);
    }
    demand(downloadedBytes === bytes.length && downloadedHash.digest('hex') === expectedHash,
      'Uploaded attachment bytes do not match the original SHA-256');
    uploaded.push({ name: attachment.name, url: result.url });
  }
  const append = descriptionAppend(input, uploaded);
  let descriptionUpdated = false;
  let update = { prunedSections: [] };
  if (append) {
    const current = await readPr();
    demand(current.lastMergeSourceCommit.commitId === expectedHead, 'PR HEAD changed during evidence upload');
    demand(current.description === undefined || typeof current.description === 'string', 'Invalid live PR description');
    update = preparePrDescriptionUpdate(current.description ?? '', append);
    const response = await fetchImpl(url, {
      method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: update.description, isDraft: true }), signal, redirect: 'error'
    });
    demand(response.ok, `Update PR description failed (HTTP ${response.status}); reconcile before retrying`);
    await response.body?.cancel();
    const final = await readPr();
    demand(final.lastMergeSourceCommit.commitId === expectedHead && final.description === update.description,
      'Live PR does not match the requested HEAD/description; reconcile before retrying');
    descriptionUpdated = true;
  } else {
    demand((await readPr()).lastMergeSourceCommit.commitId === expectedHead, 'PR HEAD changed during publication');
  }
  return {
    prId: input.prId, uploaded, commentPosted, descriptionUpdated,
    descriptionPruned: update.prunedSections.length > 0, prunedDescriptionSections: update.prunedSections
  };
}
