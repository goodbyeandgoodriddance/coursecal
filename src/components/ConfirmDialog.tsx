import { useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle, Info } from './Icon';

export interface ConfirmDialogProps {
  title: string;
  /** Body copy. A node rather than a string so callers can bold the stakes. */
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive and shows a warning icon. */
  destructive?: boolean;
  /**
   * Informational mode: a single dismiss button and no confirm action. Used
   * where the app previously called window.alert.
   */
  info?: boolean;
  /**
   * Focus the confirm button instead of Cancel, so Enter accepts. Only for
   * frequent, easily-undone confirmations — never for destructive ones, where
   * the safe button must stay the default.
   */
  focusConfirm?: boolean;
  onConfirm?: () => void;
  onClose: () => void;
}

/**
 * In-app replacement for window.confirm / window.alert.
 *
 * Reuses the same .modal CSS as ItemModal rather than introducing a second
 * dialog style, so there is one dialog look in the app.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  info = false,
  focusConfirm = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  // By default focus the safe button, so Enter cannot confirm a destructive
  // action the user has not actually read. `focusConfirm` flips that for
  // routine, reversible confirmations.
  const safeButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focusConfirm && !destructive) confirmButtonRef.current?.focus();
    else safeButtonRef.current?.focus();
  }, [focusConfirm, destructive]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <div className="modal-header">
          <span className={`confirm-icon${destructive ? ' is-destructive' : ''}`}>
            {destructive ? <AlertTriangle size={15} /> : <Info size={15} />}
          </span>
          <h2 className="modal-title" id="confirm-title">
            {title}
          </h2>
        </div>

        <div className="modal-body">
          <div className="confirm-body">{body}</div>
        </div>

        <div className="modal-footer">
          <div className="spacer" />
          {info ? (
            <button ref={safeButtonRef} className="primary" onClick={onClose}>
              {confirmLabel === 'Confirm' ? 'OK' : confirmLabel}
            </button>
          ) : (
            <>
              <button ref={safeButtonRef} onClick={onClose}>
                {cancelLabel}
              </button>
              <button
                ref={confirmButtonRef}
                className={destructive ? 'primary destructive' : 'primary'}
                onClick={() => {
                  onConfirm?.();
                  onClose();
                }}
              >
                {confirmLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
