import { useEffect, type ReactNode } from "react";
import { errorMessage } from "../api";
import { statusLabel } from "../format";

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="actions no-print">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; padded?: boolean }) {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="card-header">
          {typeof title === "string" ? <h2>{title}</h2> : title}
          {actions && <div className="actions no-print">{actions}</div>}
        </div>
      )}
      {padded ? <div className="card-body">{children}</div> : children}
    </section>
  );
}

const badgeTone: Record<string, string> = {
  PENDING: "warning",
  IN_PROGRESS: "info",
  CLOSED: "success",
  CANCELLED: "neutral",
  APPROVED: "info",
  RECEIVED: "success",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${badgeTone[status] ?? "neutral"}`}>{statusLabel[status] ?? status}</span>;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "warning" | "info" | "success" | "danger"; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <div className="spinner" role="status">{label}</div>;
}

export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  return <div className="alert alert-error" role="alert">{errorMessage(error)}</div>;
}

export function Modal({ title, onClose, children, narrow }: { title: string; onClose: () => void; children: ReactNode; narrow?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`card modal${narrow ? " narrow" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="card-header">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="card-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`field ${className ?? ""}`}>
      <label>
        {label}
        <div style={{ marginTop: 5 }}>{children}</div>
      </label>
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

export function Details({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="details">
      {items.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
