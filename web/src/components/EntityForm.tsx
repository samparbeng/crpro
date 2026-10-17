import { useState, type FormEvent } from "react";
import { ApiError } from "../api";
import { toInputDate } from "../format";
import { ErrorAlert, Field } from "./ui";

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "select" | "checkbox" | "textarea" | "password" | "email" | "tel";
  required?: boolean;
  options?: { value: string | number; label: string }[];
  /** Select fields whose value is a numeric id. */
  numeric?: boolean;
  span?: 2;
  hint?: string;
  step?: string;
};

type Values = Record<string, string | boolean>;

/** Turns an API record into form values (strings / booleans). */
function toValues(fields: FieldDef[], record: Record<string, unknown> | undefined): Values {
  const v: Values = {};
  for (const f of fields) {
    const raw = record?.[f.name];
    if (f.type === "checkbox") v[f.name] = raw === undefined ? true : Boolean(raw);
    else if (f.type === "date") v[f.name] = toInputDate(raw as string | null);
    else v[f.name] = raw == null ? "" : String(raw);
  }
  return v;
}

/** Turns form values into an API payload: empty → null, numbers parsed. */
function toPayload(fields: FieldDef[], values: Values) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.name];
    if (f.type === "checkbox") out[f.name] = Boolean(v);
    else if (f.type === "password" && v === "") continue;
    else if (v === "") out[f.name] = null;
    else if (f.type === "number" || f.numeric) out[f.name] = Number(v);
    else out[f.name] = v;
  }
  return out;
}

type Props = {
  fields: FieldDef[];
  initial?: Record<string, unknown>;
  submitLabel?: string;
  onSubmit: (payload: Record<string, unknown>) => Promise<unknown>;
  onCancel?: () => void;
};

export function EntityForm({ fields, initial, submitLabel = "Save", onSubmit, onCancel }: Props) {
  const [values, setValues] = useState(() => toValues(fields, initial));
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const fieldErrors: Record<string, string> = {};
  if (error instanceof ApiError) for (const i of error.issues) fieldErrors[i.path] ??= i.message;

  const set = (name: string, value: string | boolean) => setValues((v) => ({ ...v, [name]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(toPayload(fields, values));
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      {error && !(error instanceof ApiError && error.issues.length) ? <ErrorAlert error={error} /> : null}
      <div className="form-grid">
        {fields.map((f) => {
          const common = {
            id: f.name,
            name: f.name,
            "aria-invalid": fieldErrors[f.name] ? true : undefined,
            required: f.required,
          };
          const value = values[f.name];
          let control;
          if (f.type === "checkbox") {
            return (
              <label key={f.name} className={`checkbox ${f.span === 2 ? "span-2" : ""}`}>
                <input type="checkbox" checked={Boolean(value)} onChange={(e) => set(f.name, e.target.checked)} />
                {f.label}
              </label>
            );
          } else if (f.type === "select") {
            control = (
              <select className="input" {...common} value={String(value)} onChange={(e) => set(f.name, e.target.value)}>
                <option value="">{f.required ? "Select…" : "—"}</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            );
          } else if (f.type === "textarea") {
            control = <textarea className="input" {...common} value={String(value)} onChange={(e) => set(f.name, e.target.value)} />;
          } else {
            control = (
              <input
                className="input"
                type={f.type ?? "text"}
                step={f.step ?? (f.type === "number" ? "any" : undefined)}
                autoComplete={f.type === "password" ? "new-password" : undefined}
                {...common}
                value={String(value)}
                onChange={(e) => set(f.name, e.target.value)}
              />
            );
          }
          return (
            <Field key={f.name} label={f.required ? `${f.label} *` : f.label} error={fieldErrors[f.name]} hint={f.hint} className={f.span === 2 ? "span-2" : ""}>
              {control}
            </Field>
          );
        })}
      </div>
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
