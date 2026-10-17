import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { api, ApiError } from "../api";
import { useApi, useDrivers, useRates, useSave, useVehicleCategories, useVehicles } from "../hooks";
import { fmtDate, fmtDateTime, fmtMoney, statusLabel, toInputDate, today } from "../format";
import { DataTable, useSearch } from "../components/DataTable";
import { Card, Details, ErrorAlert, Field, Modal, PageHeader, Spinner, StatusBadge } from "../components/ui";
import type { Reservation, ReservationStatus, Source } from "../types";

const TABS: { status: ReservationStatus | ""; label: string }[] = [
  { status: "", label: "All" },
  { status: "PENDING", label: "Pending" },
  { status: "IN_PROGRESS", label: "In progress" },
  { status: "CLOSED", label: "Closed" },
  { status: "CANCELLED", label: "Cancelled" },
];

export function ReservationList() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const navigate = useNavigate();
  const { data, isLoading, error } = useApi<Reservation[]>(`/reservations${status ? `?status=${status}` : ""}`);
  const { q, setQ, filtered } = useSearch(data, (r) => [r.id, r.companyName, r.contactName, r.destination, r.driverName, r.vehicleReg]);

  return (
    <>
      <PageHeader
        title="Reservations"
        actions={<Link className="btn btn-primary" to="/reservations/new">New reservation</Link>}
      />
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.label}
            role="tab"
            aria-selected={status === t.status}
            className={status === t.status ? "active" : ""}
            onClick={() => setParams(t.status ? { status: t.status } : {})}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <input className="input" placeholder="Search company, contact, destination, #…" value={q} onChange={(e) => setQ(e.target.value)} />
        {data && <span className="muted small">{filtered.length} of {data.length}</span>}
      </div>
      <ErrorAlert error={error} />
      <Card padded={false}>
        {isLoading ? (
          <Spinner />
        ) : (
          <DataTable
            rows={filtered}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/reservations/${r.id}`)}
            empty="No reservations match."
            columns={[
              { key: "id", header: "#", hideSm: true, render: (r) => <span className="mono">{r.id}</span> },
              { key: "startDate", header: "Dates", render: (r) => <span className="nowrap">{fmtDate(r.startDate)}<div className="muted small">{r.days} day{r.days === 1 ? "" : "s"}</div></span> },
              { key: "companyName", header: "Customer", render: (r) => <>{r.companyName}<div className="muted small">{r.destination}</div></> },
              { key: "destination", header: "Destination", hideSm: true },
              { key: "category", header: "Vehicle type", hideSm: true, value: (r) => r.vehicleCategory?.name, render: (r) => r.vehicleCategory?.name ?? "—" },
              { key: "assigned", header: "Driver / vehicle", hideSm: true, value: (r) => r.driverName, render: (r) => r.driverName || r.vehicleReg ? <>{r.driverName ?? "—"}<div className="muted small">{r.vehicleReg ?? "—"}</div></> : <span className="muted">Unassigned</span> },
              { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
            ]}
          />
        )}
      </Card>
    </>
  );
}

type FormState = {
  companyName: string;
  contactName: string;
  contactPhone: string;
  vehicleCategoryId: string;
  startDate: string;
  endDate: string;
  destination: string;
  remarks: string;
};

export function ReservationForm() {
  const { id } = useParams();
  const editing = id != null;
  const existing = useApi<Reservation>(editing ? `/reservations/${id}` : null);
  if (editing && existing.isLoading) return <Spinner />;
  if (editing && !existing.data) return <ErrorAlert error={existing.error} />;
  return <ReservationFormInner existing={existing.data} />;
}

function ReservationFormInner({ existing }: { existing?: Reservation }) {
  const navigate = useNavigate();
  const categories = useVehicleCategories();
  const companies = useApi<{ companyName: string; contactName: string; contactPhone: string }[]>("/reservations/companies");
  const [f, setF] = useState<FormState>({
    companyName: existing?.companyName ?? "",
    contactName: existing?.contactName ?? "",
    contactPhone: existing?.contactPhone ?? "",
    vehicleCategoryId: existing?.vehicleCategoryId ? String(existing.vehicleCategoryId) : "",
    startDate: toInputDate(existing?.startDate) || today(),
    endDate: toInputDate(existing?.endDate) || today(),
    destination: existing?.destination ?? "",
    remarks: existing?.remarks ?? "",
  });
  const save = useSave(
    (body: object) => (existing ? api.put<Reservation>(`/reservations/${existing.id}`, body) : api.post<Reservation>("/reservations", body)),
    ["/reservations"],
  );
  const issues: Record<string, string> = {};
  if (save.error instanceof ApiError) for (const i of save.error.issues) issues[i.path] ??= i.message;

  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const pickCompany = (name: string) => {
    const match = companies.data?.find((c) => c.companyName === name.toUpperCase());
    setF((s) => ({
      ...s,
      companyName: name,
      contactName: match && !s.contactName ? match.contactName : s.contactName,
      contactPhone: match && !s.contactPhone ? match.contactPhone : s.contactPhone,
    }));
  };

  const days = f.startDate && f.endDate ? Math.round((Date.parse(f.endDate) - Date.parse(f.startDate)) / 86400000) + 1 : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(
      { ...f, vehicleCategoryId: f.vehicleCategoryId ? Number(f.vehicleCategoryId) : null, remarks: f.remarks || null },
      { onSuccess: (r) => navigate(`/reservations/${r.id}`) },
    );
  };

  return (
    <>
      <PageHeader title={existing ? `Edit reservation #${existing.id}` : "New reservation"} />
      <Card>
        <form onSubmit={submit} noValidate>
          {save.error && !(save.error instanceof ApiError && save.error.issues.length) ? <ErrorAlert error={save.error} /> : null}
          <div className="form-grid">
            <Field label="Company / customer *" error={issues.companyName}>
              <input className="input" list="companies" value={f.companyName} onChange={(e) => pickCompany(e.target.value)} />
              <datalist id="companies">
                {companies.data?.map((c) => <option key={c.companyName} value={c.companyName} />)}
              </datalist>
            </Field>
            <Field label="Vehicle type" error={issues.vehicleCategoryId}>
              <select className="input" value={f.vehicleCategoryId} onChange={set("vehicleCategoryId")}>
                <option value="">—</option>
                {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Contact name *" error={issues.contactName}>
              <input className="input" value={f.contactName} onChange={set("contactName")} />
            </Field>
            <Field label="Contact phone *" error={issues.contactPhone}>
              <input className="input" type="tel" value={f.contactPhone} onChange={set("contactPhone")} />
            </Field>
            <Field label="Start date *" error={issues.startDate}>
              <input className="input" type="date" value={f.startDate} onChange={set("startDate")} />
            </Field>
            <Field label="End date *" error={issues.endDate} hint={days && days > 0 ? `${days} day${days === 1 ? "" : "s"}` : undefined}>
              <input className="input" type="date" value={f.endDate} min={f.startDate} onChange={set("endDate")} />
            </Field>
            <Field label="Destination *" error={issues.destination} className="span-2">
              <input className="input" value={f.destination} onChange={set("destination")} />
            </Field>
            <Field label="Remarks" error={issues.remarks} className="span-2">
              <textarea className="input" value={f.remarks} onChange={set("remarks")} maxLength={500} />
            </Field>
          </div>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => navigate(-1)}>Cancel</button>
            <button className="btn btn-primary" disabled={save.isPending}>{save.isPending ? "Saving…" : existing ? "Save changes" : "Create reservation"}</button>
          </div>
        </form>
      </Card>
    </>
  );
}

function AssignmentForm({ r }: { r: Reservation }) {
  const drivers = useDrivers();
  const vehicles = useVehicles();
  const rates = useRates();
  const [source, setSource] = useState<Source | "">(r.source ?? "");
  const [driverId, setDriverId] = useState(r.driverId ? String(r.driverId) : "");
  const [vehicleId, setVehicleId] = useState(r.vehicleId ? String(r.vehicleId) : "");
  const [externalDriver, setExternalDriver] = useState(r.externalDriver ?? "");
  const [externalVehicle, setExternalVehicle] = useState(r.externalVehicle ?? "");
  const [rateId, setRateId] = useState(r.rateId ? String(r.rateId) : "");
  const save = useSave((body: object) => api.post<Reservation>(`/reservations/${r.id}/assign`, body), ["/reservations", "/drivers"]);
  const locked = r.status === "CLOSED" || r.status === "CANCELLED";
  const num = (s: string) => (s ? Number(s) : null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate({
      source: source || null,
      driverId: num(driverId),
      vehicleId: num(vehicleId),
      externalDriver: externalDriver || null,
      externalVehicle: externalVehicle || null,
      rateId: num(rateId),
    });
  };

  const inServiceDrivers = drivers.data?.filter((d) => d.inService || d.id === r.driverId);
  const activeVehicles = vehicles.data?.filter((v) => v.active || v.id === r.vehicleId);
  const activeRates = rates.data?.filter((x) => x.active || x.id === r.rateId);

  return (
    <form onSubmit={submit}>
      <ErrorAlert error={save.error} />
      {save.isSuccess && !save.isPending && <div className="alert alert-success">Assignment saved.</div>}
      <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="form-grid">
          <Field label="Source" className="span-2">
            <select className="input" value={source} onChange={(e) => setSource(e.target.value as Source | "")}>
              <option value="">Select…</option>
              <option value="IN_HOUSE">In-house (our driver & vehicle)</option>
              <option value="THIRD_PARTY">Third party</option>
            </select>
          </Field>
          {source === "IN_HOUSE" && (
            <>
              <Field label="Driver">
                <select className="input" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                  <option value="">—</option>
                  {inServiceDrivers?.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                </select>
              </Field>
              <Field label="Vehicle">
                <select className="input" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                  <option value="">—</option>
                  {activeVehicles?.map((v) => (
                    <option key={v.id} value={v.id}>{v.regNumber} — {v.category?.name ?? `${v.make} ${v.model}`}</option>
                  ))}
                </select>
              </Field>
            </>
          )}
          {source === "THIRD_PARTY" && (
            <>
              <Field label="Driver (name & phone)">
                <input className="input" value={externalDriver} onChange={(e) => setExternalDriver(e.target.value)} />
              </Field>
              <Field label="Vehicle reg. / supplier">
                <input className="input" value={externalVehicle} onChange={(e) => setExternalVehicle(e.target.value)} />
              </Field>
            </>
          )}
          <Field label="Rate code" className="span-2">
            <select className="input" value={rateId} onChange={(e) => setRateId(e.target.value)}>
              <option value="">—</option>
              {activeRates?.map((x) => (
                <option key={x.id} value={x.id}>{x.code} — {x.description} ({fmtMoney(x.totalUsd, "USD")}/day)</option>
              ))}
            </select>
          </Field>
        </div>
        {!locked && (
          <div className="form-actions">
            <button className="btn btn-primary" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save assignment"}</button>
          </div>
        )}
      </fieldset>
    </form>
  );
}

function DuplicateDialog({ r, onClose }: { r: Reservation; onClose: () => void }) {
  const navigate = useNavigate();
  const [startDate, setStart] = useState(today());
  const [endDate, setEnd] = useState(today());
  const dup = useSave((body: object) => api.post<Reservation>(`/reservations/${r.id}/duplicate`, body), ["/reservations"]);
  return (
    <Modal title={`Duplicate #${r.id}`} onClose={onClose} narrow>
      <p className="muted" style={{ marginTop: 0 }}>Creates a new pending reservation for {r.companyName} with the same details.</p>
      <ErrorAlert error={dup.error} />
      <div className="form-grid">
        <Field label="Start date"><input className="input" type="date" value={startDate} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="End date"><input className="input" type="date" value={endDate} min={startDate} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <div className="form-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={dup.isPending} onClick={() => dup.mutate({ startDate, endDate }, { onSuccess: (n) => navigate(`/reservations/${n.id}`) })}>
          Duplicate
        </button>
      </div>
    </Modal>
  );
}

export function ReservationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: r, isLoading, error } = useApi<Reservation>(`/reservations/${id}`);
  const [duplicating, setDuplicating] = useState(false);
  const act = useSave((action: string) => api.post<Reservation>(`/reservations/${id}/${action}`), ["/reservations"]);

  if (isLoading) return <Spinner />;
  if (!r) return <ErrorAlert error={error} />;

  const confirmAct = (action: string, question: string) => {
    if (window.confirm(question)) act.mutate(action);
  };

  return (
    <>
      <PageHeader
        title={<>Reservation #{r.id} <StatusBadge status={r.status} /></>}
        subtitle={`${r.companyName} · ${fmtDate(r.startDate)} – ${fmtDate(r.endDate)}`}
        actions={
          <>
            {(r.status === "PENDING" || r.status === "IN_PROGRESS") && <Link className="btn" to={`/reservations/${r.id}/edit`}>Edit</Link>}
            <button className="btn" onClick={() => setDuplicating(true)}>Duplicate</button>
            {r.status === "CLOSED" && <Link className="btn" to={`/invoices/new?reservations=${r.id}`}>Pro-forma invoice</Link>}
            {r.status === "CANCELLED" && <button className="btn" onClick={() => act.mutate("reopen")}>Reopen</button>}
            {(r.status === "PENDING" || r.status === "IN_PROGRESS") && (
              <button className="btn btn-danger" onClick={() => confirmAct("cancel", "Cancel this reservation?")}>Cancel reservation</button>
            )}
            {r.status === "PENDING" && <button className="btn btn-primary" onClick={() => act.mutate("start")} disabled={act.isPending}>Start trip</button>}
            {r.status === "IN_PROGRESS" && (
              <button className="btn btn-primary" onClick={() => confirmAct("close", "Mark this trip as completed?")} disabled={act.isPending}>Close trip</button>
            )}
          </>
        }
      />
      <ErrorAlert error={act.error} />
      <div className="grid grid-2">
        <Card title="Booking">
          <Details
            items={[
              ["Customer", r.companyName],
              ["Contact", r.contactName],
              ["Phone", <a href={`tel:${r.contactPhone}`}>{r.contactPhone}</a>],
              ["Vehicle type", r.vehicleCategory?.name],
              ["Dates", `${fmtDate(r.startDate)} – ${fmtDate(r.endDate)}`],
              ["Days", r.days],
              ["Destination", r.destination],
              ["Remarks", r.remarks],
              ["Estimate", r.estimatedTotalUsd != null ? fmtMoney(r.estimatedTotalUsd, "USD") : "—"],
              ["Booked by", r.createdBy?.fullName],
              ["Booked", fmtDateTime(r.createdAt)],
            ]}
          />
        </Card>
        <Card
          title="Assignment"
          actions={r.source ? <span className="badge">{statusLabel[r.source]}</span> : undefined}
        >
          {r.status === "PENDING" && (
            <p className="muted small" style={{ marginTop: 0 }}>Set the source, driver, vehicle and rate code, then start the trip.</p>
          )}
          <AssignmentForm key={`${r.id}-${r.status}`} r={r} />
        </Card>
      </div>
      {duplicating && <DuplicateDialog r={r} onClose={() => setDuplicating(false)} />}
      <p className="no-print" style={{ marginTop: 18 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate("/reservations")}>← All reservations</button>
      </p>
    </>
  );
}
