import { useMemo, useState } from 'react';
import type { AppData, PriorityWeights } from '../types';
import { useStore } from '../store/StoreContext';
import { buildPriorityList, normalizeWeights } from '../lib/priority';
import { formatDue } from '../lib/dates';
import {
  buildExportPayload,
  describeData,
  parseImportPayload,
  suggestedFileName,
} from '../lib/dataFile';
import { courseColorVar } from '../components/CourseBadge';
import { courseLabel } from '../lib/courses';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  AlertTriangle,
  Close,
  Export,
  ICON_INLINE,
  Import,
  ItemDone,
  Sparkles,
} from '../components/Icon';

const SLIDERS: {
  key: keyof PriorityWeights;
  name: string;
  desc: string;
}[] = [
  {
    key: 'urgency',
    name: 'Urgency',
    desc: 'How much the deadline itself matters. Turn this up to work strictly nearest-first.',
  },
  {
    key: 'gradeImpact',
    name: 'Grade impact',
    desc: 'How much the percent of your final grade matters. Turn this up to let a big exam outrank a nearer, smaller task.',
  },
  {
    key: 'importance',
    name: 'Manual importance',
    desc: 'How much your own High/Normal/Low flag matters. Turn this up to override the maths by hand.',
  },
];

const PREVIEW_COUNT = 5;

/** Feedback under the export/import buttons. */
interface FileMessage {
  text: string;
  bad: boolean;
}

export function SettingsView({ now, onStartOnboarding }: { now: Date; onStartOnboarding: () => void }) {
  const { data, activeItems, courseById, dispatch } = useStore();
  const { settings } = data;
  const [newLead, setNewLead] = useState('');
  const [fileMessage, setFileMessage] = useState<FileMessage | null>(null);
  /** Guards against a second dialog while one is already open. */
  const [busy, setBusy] = useState(false);
  /** Validated import awaiting the user's go-ahead to overwrite everything. */
  const [pendingImport, setPendingImport] = useState<{ data: AppData; path: string } | null>(null);

  const bridge = typeof window === 'undefined' ? undefined : window.coursecal;

  async function handleExport() {
    if (!bridge) {
      setFileMessage({ text: 'Exporting is only available in the desktop app.', bad: true });
      return;
    }
    setBusy(true);
    setFileMessage(null);
    try {
      const result = await bridge.exportData(buildExportPayload(data), suggestedFileName());
      if (result.ok) {
        setFileMessage({ text: `Backup saved to ${result.path}`, bad: false });
      } else if (!result.canceled) {
        setFileMessage({ text: result.error ?? 'Could not write that file.', bad: true });
      }
    } finally {
      setBusy(false);
    }
  }

  /**
   * Picks and validates a file, but does not apply it — importing replaces
   * everything, so it only proceeds after an explicit confirmation showing
   * what is about to be overwritten.
   */
  async function handleImportPick() {
    if (!bridge) {
      setFileMessage({ text: 'Importing is only available in the desktop app.', bad: true });
      return;
    }
    setBusy(true);
    setFileMessage(null);
    try {
      const picked = await bridge.importData();
      if (!picked.ok) {
        if (!picked.canceled) {
          setFileMessage({ text: picked.error ?? 'Could not read that file.', bad: true });
        }
        return;
      }

      const parsed = parseImportPayload(picked.json);
      if (!parsed.ok) {
        // Nothing has been touched at this point — say so explicitly.
        setFileMessage({ text: `${parsed.error} Your current data is unchanged.`, bad: true });
        return;
      }

      setPendingImport({ data: parsed.data, path: picked.path });
    } finally {
      setBusy(false);
    }
  }

  async function applyImport(incoming: AppData) {
    // Snapshot what is about to be lost, so a wrong file is recoverable.
    const snapshot = await bridge?.preImportSnapshot(buildExportPayload(data));
    dispatch({ type: 'replaceAll', data: incoming });
    setFileMessage({
      text:
        `Imported ${describeData(incoming)}.` +
        (snapshot?.ok ? ' Your previous data was saved to the app folder first.' : ''),
      bad: false,
    });
  }

  const normalized = normalizeWeights(settings.weights);

  // The preview recomputes from the same function the real list uses, so what
  // you see here is exactly what the Priority view will show.
  const preview = useMemo(
    () => buildPriorityList(activeItems, settings, now).upcoming.slice(0, PREVIEW_COUNT),
    [activeItems, settings, now],
  );

  const setWeight = (key: keyof PriorityWeights, value: number) =>
    dispatch({ type: 'updateSettings', patch: { weights: { ...settings.weights, [key]: value } } });

  function addLead() {
    const hours = Number(newLead);
    if (!Number.isFinite(hours) || hours <= 0) return;
    if (settings.reminderLeadsHours.includes(hours)) return;
    dispatch({
      type: 'updateSettings',
      patch: { reminderLeadsHours: [...settings.reminderLeadsHours, hours].sort((a, b) => b - a) },
    });
    setNewLead('');
  }

  return (
    <>
      <div className="view-header">
        <h1 className="view-title">Settings</h1>
        <span className="view-subtitle">Tune how CourseCal works for you</span>
        <div className="spacer" />
        <button className="ghost with-icon" onClick={onStartOnboarding}>
          <Sparkles size={ICON_INLINE} />
          Replay tour
        </button>
      </div>

      <div className="settings-grid">
        <div className="card" data-tour="priority-settings">
          <div className="section-label" style={{ marginTop: 0 }}>
            Priority weights
          </div>

          {SLIDERS.map((slider) => (
            <div key={slider.key} className="slider-row">
              <div className="slider-head">
                <span className="slider-name">{slider.name}</span>
                <span className="slider-value">
                  {(normalized[slider.key] * 100).toFixed(0)}% of score
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.weights[slider.key]}
                onChange={(event) => setWeight(slider.key, Number(event.target.value))}
                aria-label={`${slider.name} weight`}
              />
              <span className="slider-desc">{slider.desc}</span>
            </div>
          ))}

          <div className="field-hint" style={{ marginBottom: 12 }}>
            Weights are scaled to sum to 100%, so moving one slider only changes the balance
            between them — never the overall spread of scores.
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() =>
                dispatch({
                  type: 'updateSettings',
                  patch: { weights: { urgency: 0.45, gradeImpact: 0.35, importance: 0.2 } },
                })
              }
            >
              Reset to defaults
            </button>
          </div>

          <div className="section-label">Horizon</div>
          <div className="field">
            <label className="field-label" htmlFor="horizon">
              Priority list looks ahead
            </label>
            <select
              id="horizon"
              value={settings.horizonWeeks}
              onChange={(event) =>
                dispatch({
                  type: 'updateSettings',
                  patch: { horizonWeeks: Number(event.target.value) },
                })
              }
            >
              {[1, 2, 3, 4, 6, 8, 12].map((weeks) => (
                <option key={weeks} value={weeks}>
                  {weeks} week{weeks === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="section-label" style={{ marginTop: 0 }}>
              Live preview · top {PREVIEW_COUNT}
            </div>

            {preview.length === 0 ? (
              <div className="field-hint">Nothing in the horizon to rank.</div>
            ) : (
              <div className="preview-list">
                {preview.map((entry, index) => {
                  const course = courseById(entry.item.courseId);
                  return (
                    <div
                      key={entry.item.id}
                      className="preview-row"
                      style={{
                        ['--course-color' as string]: course
                          ? courseColorVar(course.colorIndex)
                          : undefined,
                      }}
                    >
                      <span className="rank">{index + 1}</span>
                      <span className="course-badge" style={{ ['--course-color' as string]: course ? courseColorVar(course.colorIndex) : undefined }}>
                        {courseLabel(course)}
                      </span>
                      <span className="preview-title">{entry.item.title}</span>
                      <div className="spacer" />
                      <span className="score-number">{entry.breakdown.score.toFixed(0)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="field-hint" style={{ marginTop: 10 }}>
              Drag a slider and watch this reorder. Overdue items are excluded here — they always
              pin to the top of the real list.
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }} data-tour="reminders-settings">
            <div className="section-label" style={{ marginTop: 0 }}>
              Reminders
            </div>

            <label className="checkbox-row" style={{ marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={settings.notificationsEnabled}
                onChange={(event) =>
                  dispatch({
                    type: 'updateSettings',
                    patch: { notificationsEnabled: event.target.checked },
                  })
                }
              />
              Desktop notifications for upcoming deadlines
            </label>

            <label className="checkbox-row" style={{ marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={settings.soundEnabled !== false}
                onChange={(event) =>
                  dispatch({
                    type: 'updateSettings',
                    patch: { soundEnabled: event.target.checked },
                  })
                }
              />
              Play a quiet chime when you tick something off
            </label>

            <div className="field">
              <span className="field-label">Notify me this many hours before</span>
              <div className="lead-chips">
                {settings.reminderLeadsHours.length === 0 && (
                  <span className="field-hint">No lead times set.</span>
                )}
                {settings.reminderLeadsHours.map((hours) => (
                  <span key={hours} className="lead-chip">
                    {hours >= 24 && hours % 24 === 0
                      ? `${hours / 24} day${hours === 24 ? '' : 's'}`
                      : `${hours} hour${hours === 1 ? '' : 's'}`}
                    <button
                      onClick={() =>
                        dispatch({
                          type: 'updateSettings',
                          patch: {
                            reminderLeadsHours: settings.reminderLeadsHours.filter(
                              (lead) => lead !== hours,
                            ),
                          },
                        })
                      }
                      aria-label={`Remove ${hours} hour reminder`}
                    >
                      <Close size={11} />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'flex-end' }}>
              <div className="field" style={{ maxWidth: 120 }}>
                <label className="field-label" htmlFor="lead-input">
                  Add lead time (h)
                </label>
                <input
                  id="lead-input"
                  type="number"
                  min={0.1}
                  step={0.5}
                  placeholder="e.g. 48"
                  value={newLead}
                  onChange={(event) => setNewLead(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') addLead();
                  }}
                />
              </div>
              <button onClick={addLead}>Add</button>
            </div>

            <div className="field-hint" style={{ marginTop: 10 }}>
              Reminders fire only while CourseCal is running, and each one fires once — closing and
              reopening the app will not repeat a reminder you have already seen.
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }} data-tour="data-settings">
            <div className="section-label" style={{ marginTop: 0 }}>
              Data
            </div>
            <div className="field-hint" style={{ marginBottom: 10 }}>
              {data.courses.length} course{data.courses.length === 1 ? '' : 's'} ·{' '}
              {data.items.length} item{data.items.length === 1 ? '' : 's'} ·{' '}
              {data.terms.length} term{data.terms.length === 1 ? '' : 's'}.
            </div>

            <div className="field-hint warn-note" style={{ marginBottom: 10 }}>
              Your data is stored only on this machine. Export a backup before reinstalling
              Windows, moving to another computer, or clearing the app's data.
            </div>

            <div className="button-row">
              <button className="with-icon" onClick={handleExport} disabled={busy}>
                <Export size={ICON_INLINE} />
                Export backup
              </button>
              <button className="with-icon" onClick={handleImportPick} disabled={busy}>
                <Import size={ICON_INLINE} />
                Import backup
              </button>
            </div>

            {fileMessage && (
              <div className={`file-message${fileMessage.bad ? ' is-bad' : ''}`}>
                {fileMessage.bad ? (
                  <AlertTriangle size={13} />
                ) : (
                  <ItemDone size={13} />
                )}
                <span>{fileMessage.text}</span>
              </div>
            )}


          </div>
        </div>
      </div>

      {preview[0] && (
        <div className="field-hint" style={{ marginTop: 14 }}>
          Top item right now: <strong>{preview[0].item.title}</strong> —{' '}
          {formatDue(preview[0].item.dueAt, preview[0].item.allDay, now)}.
        </div>
      )}

      {pendingImport && (
        <ConfirmDialog
          destructive
          title="Replace all your data?"
          body={
            <>
              <p>
                That backup holds <strong>{describeData(pendingImport.data)}</strong>.
              </p>
              <p>
                Importing it replaces everything currently in CourseCal —{' '}
                <strong>{describeData(data)}</strong> — including your grades and settings.
              </p>
              <p className="field-hint">
                A copy of your current data will be saved into the app's folder first, so this is
                recoverable.
              </p>
            </>
          }
          confirmLabel="Replace my data"
          onConfirm={() => void applyImport(pendingImport.data)}
          onClose={() => setPendingImport(null)}
        />
      )}

    </>
  );
}
