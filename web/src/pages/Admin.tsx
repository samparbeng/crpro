import { useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useApi, useRates, useSave, useVehicleCategories, useVendorCategories } from "../hooks";
import { fmtDate, fmtMoney, today } from "../format";
import { DataTable, useSearch } from "../components/DataTable";
import { EntityForm, type FieldDef } from "../components/EntityForm";
import { Badge, Card, ErrorAlert, Field, Modal, PageHeader, Spinner } from "../components/ui";
import type { ExchangeRate, Rate, User, VehicleCategory, VendorCategory } from "../types";

// ---- Rates -----------------------------------------------------------------------

const rateFields: FieldDef[] = [
  { name: "code", label: "Rate code", required: true },
  { name: "category", label: "Category", required: true },
  { name: "description", label: "Description", required: true, span: 2 },
  { name: "vehicleUsd", label: "Vehicle (USD/day)", type: "number", required: true },
  { name: "levyUsd", label: "Levy", type: "number" },
  { name: "vatUsd", label: "VAT", type: "number" },
  { name: "getFundLevyUsd", label: "GETFund levy", type: "number" },
  { name: "driverAllowanceUsd", label: "Driver allowance", type: "number" },
  { name: "fuelUsd", label: "Fuel", type: "number" },
  { name: "active", label: "Active", type: "checkbox" },
];

export function RateList() {
  const { isAdmin } = useAuth();
  const { data, isLoading, error } = useRates();
  const [editing, setEditing] = useState<Rate | "new" | null>(null);
  const { q, setQ, filtered } = useSearch(data, (r) => [r.code, r.category, r.description]);
  const save = useSave(
    ({ id, body }: { id?: number; body: object }) => (id ? api.put(`/rates/${id}`, body) : api.post("/rates", body)),
    ["/rates"],
  );

  return (
    <>
      <PageHeader
        title="Rates"
        subtitle="Daily trip rates in USD, used for reservations and pro-forma invoices."
        actions={isAdmin && <button className="btn btn-primary" onClick={() => setEditing("new")}>Add rate</button>}
      />
      <div className="toolbar">
        <input className="input" placeholder="Search code or description…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ErrorAlert error={error} />
      <Card padded={false}>
        {isLoading ? (
          <Spinner />
        ) : (
          <DataTable
            rows={filtered}
            rowKey={(r) => r.id}
            onRowClick={isAdmin ? setEditing : undefined}
            columns={[
              { key: "code", header: "Code", render: (r) => <strong className="mono">{r.code}</strong> },
              { key: "category", header: "Category" },
              { key: "description", header: "Description" },
              { key: "vehicleUsd", header: "Vehicle", align: "right", value: (r) => Number(r.vehicleUsd), render: (r) => <span className="mono">{fmtMoney(r.vehicleUsd)}</span> },
              { key: "taxes", header: "Levies & VAT", align: "right", sortable: false, render: (r) => <span className="mono">{fmtMoney(Number(r.levyUsd) + Number(r.vatUsd) + Number(r.getFundLevyUsd))}</span> },
              { key: "driverAllowanceUsd", header: "Driver", align: "right", value: (r) => Number(r.driverAllowanceUsd), render: (r) => <span className="mono">{fmtMoney(r.driverAllowanceUsd)}</span> },
              { key: "totalUsd", header: "Total / day", align: "right", render: (r) => <strong className="mono">{fmtMoney(r.totalUsd, "USD")}</strong> },
              { key: "active", header: "", sortable: false, render: (r) => (r.active ? null : <Badge>Inactive</Badge>) },
            ]}
          />
        )}
      </Card>
      {editing && (
        <Modal title={editing === "new" ? "Add rate" : `Edit ${editing.code}`} onClose={() => setEditing(null)}>
          <EntityForm
            fields={rateFields}
            initial={editing === "new" ? { levyUsd: 0, vatUsd: 0, getFundLevyUsd: 0, driverAllowanceUsd: 0, fuelUsd: 0 } : editing}
            onCancel={() => setEditing(null)}
            onSubmit={async (body) => {
              await save.mutateAsync({ id: editing === "new" ? undefined : editing.id, body });
              setEditing(null);
            }}
          />
        </Modal>
      )}
    </>
  );
}

// ---- Settings: categories & exchange rates ---------------------------------------

function SimpleList<T extends { id: number }>({
  title,
  path,
  rows,
  fields,
  columns,
}: {
  title: string;
  path: string;
  rows: T[] | undefined;
  fields: FieldDef[];
  columns: { key: string; header: string }[];
}) {
  const { isAdmin } = useAuth();
  const [editing, setEditing] = useState<T | "new" | null>(null);
  const save = useSave(
    ({ id, body }: { id?: number; body: object }) => (id ? api.put(`${path}/${id}`, body) : api.post(path, body)),
    [path],
  );
  const del = useSave((id: number) => api.del(`${path}/${id}`), [path]);
  return (
    <Card title={title} padded={false} actions={isAdmin && <button className="btn btn-sm" onClick={() => setEditing("new")}>Add</button>}>
      <ErrorAlert error={del.error} />
      {rows ? <DataTable rows={rows} rowKey={(r) => r.id} onRowClick={isAdmin ? setEditing : undefined} columns={columns} /> : <Spinner />}
      {editing && (
        <Modal title={editing === "new" ? `Add to ${title.toLowerCase()}` : "Edit"} onClose={() => setEditing(null)} narrow>
          <EntityForm
            fields={fields}
            initial={editing === "new" ? undefined : (editing as Record<string, unknown>)}
            onCancel={() => setEditing(null)}
            onSubmit={async (body) => {
              await save.mutateAsync({ id: editing === "new" ? undefined : editing.id, body });
              setEditing(null);
            }}
          />
          {editing !== "new" && (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => window.confirm("Delete this entry?") && del.mutate(editing.id, { onSettled: () => setEditing(null) })}
            >
              Delete
            </button>
          )}
        </Modal>
      )}
    </Card>
  );
}

function ExchangeRates() {
  const { isAdmin } = useAuth();
  const { data } = useApi<ExchangeRate[]>("/exchange-rates");
  const [date, setDate] = useState(today());
  const [rate, setRate] = useState("");
  const save = useSave((body: object) => api.post("/exchange-rates", body), ["/exchange-rates"]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate({ effectiveDate: date, usdToGhs: Number(rate) }, { onSuccess: () => setRate("") });
  };
  return (
    <Card title="Exchange rates (USD → GHS)" padded={false}>
      {isAdmin && (
        <form className="card-body actions" onSubmit={submit} style={{ alignItems: "flex-end" }}>
          <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Rate"><input className="input" type="number" step="0.0001" min="0" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
          <button className="btn btn-primary" disabled={!rate || save.isPending}>Save rate</button>
        </form>
      )}
      <ErrorAlert error={save.error} />
      {data ? (
        <DataTable
          rows={data}
          rowKey={(r) => r.id}
          columns={[
            { key: "effectiveDate", header: "Date", render: (r) => fmtDate(r.effectiveDate) },
            { key: "usdToGhs", header: "Rate", align: "right", value: (r) => Number(r.usdToGhs), render: (r) => <span className="mono">{Number(r.usdToGhs).toFixed(4)}</span> },
            { key: "by", header: "Set by", sortable: false, render: (r) => r.createdBy?.fullName ?? "—" },
          ]}
        />
      ) : (
        <Spinner />
      )}
    </Card>
  );
}

export function Settings() {
  const vehicleCats = useVehicleCategories();
  const vendorCats = useVendorCategories();
  const { isAdmin } = useAuth();
  return (
    <>
      <PageHeader title="Categories & exchange rates" subtitle={isAdmin ? undefined : "Only administrators can change these."} />
      <div className="grid grid-2">
        <SimpleList<VehicleCategory>
          title="Vehicle categories"
          path="/vehicle-categories"
          rows={vehicleCats.data}
          fields={[{ name: "code", label: "Code", required: true }, { name: "name", label: "Name", required: true }]}
          columns={[{ key: "code", header: "Code" }, { key: "name", header: "Name" }]}
        />
        <SimpleList<VendorCategory>
          title="Vendor categories"
          path="/vendor-categories"
          rows={vendorCats.data}
          fields={[{ name: "name", label: "Name", required: true, span: 2 }]}
          columns={[{ key: "name", header: "Name" }]}
        />
        <ExchangeRates />
      </div>
    </>
  );
}

// ---- Users -----------------------------------------------------------------------

export function UserList() {
  const { data, isLoading, error } = useApi<User[]>("/users");
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const save = useSave(
    ({ id, body }: { id?: number; body: object }) => (id ? api.put(`/users/${id}`, body) : api.post("/users", body)),
    ["/users"],
  );
  const fields = (isNew: boolean): FieldDef[] => [
    { name: "username", label: "Username", required: true },
    { name: "fullName", label: "Full name", required: true },
    { name: "role", label: "Role", type: "select", required: true, options: [{ value: "STAFF", label: "Staff" }, { value: "ADMIN", label: "Administrator" }] },
    { name: "designation", label: "Job title" },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "password", label: isNew ? "Password" : "New password", type: "password", required: isNew, hint: isNew ? "At least 8 characters." : "Leave empty to keep the current password." },
    { name: "active", label: "Active (can sign in)", type: "checkbox" },
  ];

  return (
    <>
      <PageHeader title="Users" actions={<button className="btn btn-primary" onClick={() => setEditing("new")}>Add user</button>} />
      <ErrorAlert error={error} />
      <Card padded={false}>
        {isLoading ? (
          <Spinner />
        ) : (
          <DataTable
            rows={data ?? []}
            rowKey={(u) => u.id}
            onRowClick={setEditing}
            columns={[
              { key: "fullName", header: "Name", render: (u) => <strong>{u.fullName}</strong> },
              { key: "username", header: "Username", render: (u) => <span className="mono">{u.username}</span> },
              { key: "designation", header: "Job title" },
              { key: "role", header: "Role", render: (u) => (u.role === "ADMIN" ? <Badge tone="info">Administrator</Badge> : "Staff") },
              { key: "active", header: "Status", render: (u) => (u.active ? <Badge tone="success">Active</Badge> : <Badge>Disabled</Badge>) },
            ]}
          />
        )}
      </Card>
      {editing && (
        <Modal title={editing === "new" ? "Add user" : `Edit ${editing.fullName}`} onClose={() => setEditing(null)}>
          <EntityForm
            fields={fields(editing === "new")}
            initial={editing === "new" ? { role: "STAFF" } : editing}
            onCancel={() => setEditing(null)}
            onSubmit={async (body) => {
              await save.mutateAsync({ id: editing === "new" ? undefined : editing.id, body });
              setEditing(null);
            }}
          />
        </Modal>
      )}
    </>
  );
}

// ---- Account ---------------------------------------------------------------------

export function Account() {
  const { user } = useAuth();
  const [done, setDone] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <PageHeader title="My account" subtitle={`${user?.fullName} · ${user?.username}`} />
      <div style={{ maxWidth: 520 }}>
        <Card title="Change password">
          {done && <div className="alert alert-success">Password changed.</div>}
          <EntityForm
            key={key}
            fields={[
              { name: "currentPassword", label: "Current password", type: "password", required: true, span: 2 },
              { name: "newPassword", label: "New password", type: "password", required: true, span: 2, hint: "At least 8 characters." },
            ]}
            submitLabel="Change password"
            onSubmit={async (body) => {
              setDone(false);
              await api.post("/auth/change-password", body);
              setDone(true);
              setKey((k) => k + 1);
            }}
          />
        </Card>
      </div>
    </>
  );
}

// ---- Reports ---------------------------------------------------------------------

type ReportData = {
  from: string;
  to: string;
  reservationsByMonth: { month: string; PENDING: number; IN_PROGRESS: number; CLOSED: number; CANCELLED: number }[];
  topCustomers: { companyName: string; count: number }[];
  sourceSplit: { IN_HOUSE: number; THIRD_PARTY: number };
  serviceSpendByVehicle: { regNumber: string; count: number; amount: number }[];
  purchaseSpendByVendor: { vendor: string; count: number; amount: number }[];
  totals: { reservations: number; serviceSpend: number; purchaseSpend: number; invoicedUsd: number };
};

export function Reports() {
  const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(yearAgo);
  const [to, setTo] = useState(today());
  const { data, isLoading, error } = useApi<ReportData>(`/reports?from=${from}&to=${to}`);

  return (
    <>
      <PageHeader title="Reports" />
      <div className="toolbar">
        <Field label="From"><input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <ErrorAlert error={error} />
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          <div className="stats">
            {[
              ["Reservations", String(data.totals.reservations)],
              ["Invoiced", fmtMoney(data.totals.invoicedUsd, "USD")],
              ["Service spend", fmtMoney(data.totals.serviceSpend, "GHS")],
              ["Purchase orders", fmtMoney(data.totals.purchaseSpend, "GHS")],
              ["In-house / third party", `${data.sourceSplit.IN_HOUSE} / ${data.sourceSplit.THIRD_PARTY}`],
            ].map(([label, value]) => (
              <div key={label} className="card stat">
                <div className="label">{label}</div>
                <div className="value" style={{ fontSize: 22 }}>{value}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-2">
            <Card title="Reservations by month" padded={false}>
              <DataTable
                rows={data.reservationsByMonth}
                rowKey={(r) => r.month}
                empty="No reservations in this period."
                columns={[
                  { key: "month", header: "Month", render: (r) => new Date(`${r.month}-01`).toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" }) },
                  { key: "CLOSED", header: "Closed", align: "right" },
                  { key: "IN_PROGRESS", header: "In progress", align: "right" },
                  { key: "PENDING", header: "Pending", align: "right" },
                  { key: "CANCELLED", header: "Cancelled", align: "right" },
                ]}
              />
            </Card>
            <Card title="Top customers" padded={false}>
              <DataTable
                rows={data.topCustomers}
                rowKey={(r) => r.companyName}
                empty="No customers in this period."
                columns={[
                  { key: "companyName", header: "Customer" },
                  { key: "count", header: "Bookings", align: "right" },
                ]}
              />
            </Card>
            <Card title="Service spend by vehicle (GH₵)" padded={false}>
              <DataTable
                rows={data.serviceSpendByVehicle}
                rowKey={(r) => r.regNumber}
                empty="No service records in this period."
                columns={[
                  { key: "regNumber", header: "Vehicle" },
                  { key: "count", header: "Services", align: "right" },
                  { key: "amount", header: "Amount", align: "right", render: (r) => <span className="mono">{fmtMoney(r.amount)}</span> },
                ]}
              />
            </Card>
            <Card title="Purchase spend by vendor (GH₵)" padded={false}>
              <DataTable
                rows={data.purchaseSpendByVendor}
                rowKey={(r) => r.vendor}
                empty="No purchase orders in this period."
                columns={[
                  { key: "vendor", header: "Vendor" },
                  { key: "count", header: "POs", align: "right" },
                  { key: "amount", header: "Amount", align: "right", render: (r) => <span className="mono">{fmtMoney(r.amount)}</span> },
                ]}
              />
            </Card>
          </div>
        </>
      )}
    </>
  );
}
