import type { TeardownReport } from '../types.js';

/**
 * S7: re-running a new rubric version against the same URLs must produce a
 * readable diff. Gaps are matched by axis id, because that is the thing the
 * rubric holds stable across versions — titles and ranks are outputs.
 */

export interface AxisDelta {
  axisId: string;
  axisName: string;
  status: 'added' | 'removed' | 'held' | 'moved';
  fromRank?: number;
  toRank?: number;
  fromTitle?: string;
  toTitle?: string;
}

export interface ReportDiff {
  host: string;
  from: { rubricVersion: string; generatedAt: string };
  to: { rubricVersion: string; generatedAt: string };
  sameTarget: boolean;
  axes: AxisDelta[];
  unitOfWork: { from: string | null; to: string | null; changed: boolean };
  beats: { from: number; to: number };
  boringCase: { from: boolean; to: boolean };
  objectionAxes: { added: string[]; removed: string[] };
}

export function diffReports(from: TeardownReport, to: TeardownReport): ReportDiff {
  const fromGaps = new Map(from.gaps.map(g => [g.axisId, g]));
  const toGaps = new Map(to.gaps.map(g => [g.axisId, g]));

  const axes: AxisDelta[] = [];
  for (const [axisId, gap] of toGaps) {
    const prior = fromGaps.get(axisId);
    if (!prior) {
      axes.push({ axisId, axisName: gap.axisName, status: 'added', toRank: gap.rank, toTitle: gap.title });
    } else {
      axes.push({
        axisId,
        axisName: gap.axisName,
        status: prior.rank === gap.rank ? 'held' : 'moved',
        fromRank: prior.rank,
        toRank: gap.rank,
        fromTitle: prior.title,
        toTitle: gap.title,
      });
    }
  }
  for (const [axisId, gap] of fromGaps) {
    if (!toGaps.has(axisId)) {
      axes.push({ axisId, axisName: gap.axisName, status: 'removed', fromRank: gap.rank, fromTitle: gap.title });
    }
  }

  const order = { added: 0, moved: 1, held: 2, removed: 3 } as const;
  axes.sort((a, b) =>
    order[a.status] - order[b.status] || (a.toRank ?? a.fromRank ?? 0) - (b.toRank ?? b.fromRank ?? 0)
  );

  const fromAxes = new Set(from.spine.objections.map(o => o.axisId));
  const toAxes = new Set(to.spine.objections.map(o => o.axisId));

  return {
    host: to.target.host,
    from: { rubricVersion: from.rubricVersion, generatedAt: from.generatedAt },
    to: { rubricVersion: to.rubricVersion, generatedAt: to.generatedAt },
    sameTarget: from.target.host === to.target.host,
    axes,
    unitOfWork: {
      from: from.claims.unitOfWork.unit,
      to: to.claims.unitOfWork.unit,
      changed: from.claims.unitOfWork.unit !== to.claims.unitOfWork.unit,
    },
    beats: { from: from.spine.beats.length, to: to.spine.beats.length },
    boringCase: {
      from: from.spine.beats.some(b => b.boringCase),
      to: to.spine.beats.some(b => b.boringCase),
    },
    objectionAxes: {
      added: [...toAxes].filter(a => !fromAxes.has(a)),
      removed: [...fromAxes].filter(a => !toAxes.has(a)),
    },
  };
}

const MARK = { added: '+', removed: '−', moved: '~', held: '=' } as const;

export function renderDiffMarkdown(diff: ReportDiff): string {
  const lines = [
    `# Rubric diff — ${diff.host}`,
    '',
    `**v${diff.from.rubricVersion}** (${diff.from.generatedAt}) → **v${diff.to.rubricVersion}** (${diff.to.generatedAt})`,
    '',
  ];

  if (!diff.sameTarget) {
    lines.push('> ⚠️ These reports target different companies. The diff below is not an eval signal.', '');
  }
  if (diff.from.rubricVersion === diff.to.rubricVersion) {
    lines.push(
      `> Both reports were produced by rubric v${diff.to.rubricVersion}. Any movement here is model or page variance, not rubric change.`,
      '',
    );
  }

  lines.push('## Gaps by axis', '', '| | Axis | v' + diff.from.rubricVersion + ' | v' + diff.to.rubricVersion + ' | Title now |', '| --- | --- | --- | --- | --- |');
  for (const axis of diff.axes) {
    lines.push(
      `| ${MARK[axis.status]} | ${axis.axisName} | ${axis.fromRank ? `#${axis.fromRank}` : '—'} | ${
        axis.toRank ? `#${axis.toRank}` : '—'
      } | ${(axis.toTitle ?? axis.fromTitle ?? '').replace(/\|/g, '\\|')} |`,
    );
  }

  const added = diff.axes.filter(a => a.status === 'added').length;
  const removed = diff.axes.filter(a => a.status === 'removed').length;
  const moved = diff.axes.filter(a => a.status === 'moved').length;
  const held = diff.axes.filter(a => a.status === 'held').length;

  lines.push(
    '',
    `${held} held rank, ${moved} moved, ${added} newly surfaced, ${removed} dropped out.`,
    '',
    '## Everything else',
    '',
    `- **Unit of work:** ${
      diff.unitOfWork.changed
        ? `${diff.unitOfWork.from ?? '(none stated)'} → ${diff.unitOfWork.to ?? '(none stated)'}`
        : `unchanged (${diff.unitOfWork.to ?? 'none stated'})`
    }`,
    `- **Spine beats:** ${diff.beats.from} → ${diff.beats.to}`,
    `- **Boring case present:** ${diff.boringCase.from ? 'yes' : 'no'} → ${diff.boringCase.to ? 'yes' : 'no'}`,
  );

  if (diff.objectionAxes.added.length > 0) {
    lines.push(`- **Objection axes added:** ${diff.objectionAxes.added.join(', ')}`);
  }
  if (diff.objectionAxes.removed.length > 0) {
    lines.push(`- **Objection axes dropped:** ${diff.objectionAxes.removed.join(', ')}`);
  }

  lines.push(
    '',
    added + removed + moved === 0
      ? '**Read:** the rubric held. Same axes, same order — evidence it generalizes rather than being tuned per company.'
      : '**Read:** the rubric moved findings on this company. Check whether the movement is the rubric getting sharper or the page having changed underneath it.',
    '',
  );

  return lines.join('\n');
}
