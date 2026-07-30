import type { TeardownReport } from '../types.js';

function heading(report: TeardownReport): string {
  return [
    `# Teardown — ${report.target.host}`,
    '',
    `**Rubric** v${report.rubricVersion} · **Generated** ${report.generatedAt} · **Model** ${report.model} (effort: ${report.effort})`,
    `**Source** ${report.target.url}`,
    '',
    '> Everything below is derived from this company\'s public web surface only — no product access, no screenshots, no sandbox. Every quotation was matched against the fetched pages before it was printed. If a buyer could not have read it, it is not in here.',
  ].join('\n');
}

function whatWasRead(report: TeardownReport): string {
  const rows = report.surface.pages.map(
    p => `| ${p.kind} | ${p.url} | ${p.chars.toLocaleString()}${p.truncated ? ' (truncated)' : ''} |`
  );
  const lines = [
    '## What was read',
    '',
    '| Page | URL | Characters |',
    '| --- | --- | --- |',
    ...rows,
  ];

  if (report.surface.videos.length > 0) {
    lines.push(
      '',
      '**Demo videos detected** (no transcript available — no claim below is drawn from these):',
      ...report.surface.videos.map(v => `- ${v.url} (${v.provider})`),
    );
  }
  if (report.surface.notes.length > 0) {
    lines.push('', '**Limits of this read:**', ...report.surface.notes.map(n => `- ${n}`));
  }
  return lines.join('\n');
}

function claimInventory(report: TeardownReport): string {
  const { claims, unitOfWork } = report.claims;
  const lines = [
    '## Your claims, as a buyer reads them',
    '',
    'Check this section first. If it does not characterize you fairly, stop reading — the critique below is built on it.',
    '',
  ];

  if (claims.length === 0) {
    lines.push('_No claims could be verified against the fetched pages._');
  } else {
    const byKind = new Map<string, typeof claims>();
    for (const claim of claims) {
      byKind.set(claim.kind, [...(byKind.get(claim.kind) ?? []), claim]);
    }
    for (const [kind, group] of byKind) {
      lines.push(`**${kind[0].toUpperCase()}${kind.slice(1)}**`, '');
      for (const claim of group) {
        lines.push(`- **${claim.id}.** ${claim.text}`);
        lines.push(`  > ${claim.quote.replace(/\n+/g, ' ')}`);
        lines.push(`  <sub>${claim.sourceUrl}</sub>`);
      }
      lines.push('');
    }
  }

  lines.push(
    '### Unit of work',
    '',
    unitOfWork.stated
      ? `Your page defines the unit as **${unitOfWork.unit}**.${
          unitOfWork.evidence ? `\n\n> ${unitOfWork.evidence.replace(/\n+/g, ' ')}` : ''
        }`
      : '**Your page never defines one.** A buyer cannot answer "what am I buying one of?" from this surface, which means they cannot price you, cannot compare you, and cannot champion you internally.',
  );

  return lines.join('\n');
}

function gapsSection(report: TeardownReport): string {
  const lines = [
    `## The ${report.gaps.length} gap${report.gaps.length === 1 ? '' : 's'} costing you deals`,
    '',
    'Ranked by cost, not severity. This is deliberately not exhaustive.',
    '',
  ];

  for (const gap of report.gaps) {
    lines.push(
      `### ${gap.rank}. ${gap.title}`,
      '',
      `**Axis** ${gap.axisName} · **Buyer question** _${gap.buyerQuestion}_`,
      `**Stalls at** ${gap.dealStage}`,
      '',
      `**What your page says.** ${gap.whatThePageSays}`,
      '',
      `**What's missing.** ${gap.whatsMissing}`,
      '',
      `**What it costs.** ${gap.costOfTheGap}`,
    );

    const verified = gap.evidence.filter(e => e.verified !== false);
    if (verified.length > 0) {
      lines.push('', '<details><summary>Evidence</summary>', '');
      for (const e of verified) {
        lines.push(`> ${e.quote.replace(/\n+/g, ' ')}`, `> — ${e.sourceUrl}`, '');
      }
      lines.push('</details>');
    }
    lines.push('');
  }

  return lines.join('\n');
}

function spineSection(report: TeardownReport): string {
  const { beats, objections } = report.spine;
  const lines = [
    '## The demo spine',
    '',
    `${beats.length} beats. Run it as written — it is designed to be given, not redesigned.`,
    '',
  ];

  for (const beat of beats) {
    lines.push(
      `### Beat ${beat.n} — ${beat.name}${beat.boringCase ? ' _(the boring case)_' : ''}`,
      '',
      `- **Shown:** ${beat.shown}`,
      `- **Proves:** ${beat.claimProved}`,
      `- **Deliberately omits:** ${beat.deliberatelyOmitted}`,
      '',
    );
  }

  if (!beats.some(b => b.boringCase)) {
    lines.push(
      '> ⚠️ No beat in this spine shows the repeated, high-frequency case. The rubric requires one. Treat this spine as incomplete.',
      '',
    );
  }

  if (objections.length > 0) {
    lines.push(
      '## Where the objections land',
      '',
      'Preempt these in the beat named. Reacting to them is losing.',
      '',
      '| # | Objection | Lands at | Defused by | How |',
      '| --- | --- | --- | --- | --- |',
      ...objections.map(
        o => `| ${o.rank} | ${o.objection.replace(/\|/g, '\\|')} | ${o.landsAtStage.replace(/\|/g, '\\|')} | Beat ${o.defusedByBeat} | ${o.howItIsDefused.replace(/\|/g, '\\|')} |`
      ),
      '',
    );
  }

  return lines.join('\n');
}

function methodSection(report: TeardownReport): string {
  const { integrity, calibration } = report;
  const lines = [
    '## Method',
    '',
    `- **Rubric** v${report.rubricVersion}. Re-running a later rubric version on this same URL produces a diff, not a fresh anecdote.`,
    `- **Claim verification.** ${integrity.claimsVerified} of ${integrity.claimsTotal} extracted claims were matched verbatim against the fetched pages and kept.`,
  ];

  if (integrity.claimsDropped > 0) {
    // Deliberately count-only: the dropped text is model-fabricated, and
    // printing it here would put sentences in this report that the company
    // never wrote. The quotes are kept in report.json under
    // `integrity.droppedQuotes` for rubric and model debugging.
    lines.push(
      `- **${integrity.claimsDropped} claim${integrity.claimsDropped === 1 ? '' : 's'} dropped** for failing verification, and excluded from every section above. See \`integrity.droppedQuotes\` in report.json.`,
    );
  }

  lines.push(
    '',
    '### Rubric calibration',
    '',
    calibration.dominant
      ? `Findings concentrated on the axes this rubric expects to dominate (${calibration.expected.join(', ')}), as designed.`
      : `⚠️ Findings did **not** concentrate on the axes this rubric expects to dominate.\n\n- Expected: ${calibration.expected.join(', ')}\n- Observed: ${calibration.observed.join(', ') || '(none)'}\n\n${calibration.note}`,
  );

  return lines.join('\n');
}

export function renderMarkdown(report: TeardownReport): string {
  if (report.integrity.voided) {
    return [
      heading(report),
      '',
      '## ⛔ Report voided',
      '',
      `Not one of the ${report.integrity.claimsTotal} extracted claims could be matched verbatim against the fetched pages.`,
      '',
      'The trust gate failed, so no critique is printed. This usually means the pages are client-rendered and the fetched HTML carried no readable copy — check "What was read" below.',
      '',
      whatWasRead(report),
    ].join('\n');
  }

  return [
    heading(report),
    '',
    whatWasRead(report),
    '',
    claimInventory(report),
    '',
    gapsSection(report),
    spineSection(report),
    methodSection(report),
    '',
  ].join('\n');
}
