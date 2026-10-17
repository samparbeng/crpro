import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { api } from "../api";
import { useAuth } from "../auth";
import { options, useApi, useDrivers, useSave, useVehicleCategories, useVehicles, useVendorCategories } from "../hooks";
import { daysUntil, dueLabel, fmtDate, fmtMoney, today } from "../format";
import { DataTable, useSearch } from "../components/DataTable";
import { EntityForm, type FieldDef } from "../components/EntityForm";
import { Badge, Card, Details, ErrorAlert, Modal, PageHeader, Spinner, StatusBadge } from "../components/ui";
import type { Driver, Reservation, ServiceRecord, Vehicle, Vendor } from "../types";

function ExpiryBadge({ date }: { date: string | null }) {
  const d = daysUntil(date);
  if (d == null) return <span className="muted">—</span>;
  const tone = d < 0 ? "danger" : d <= 30 ? "warning" : "neutral";
  return (
    <span className="nowrap">
      {fmtDate(date)} {d <= 30 && <Badge tone={tone}>{dueLabel(date)}</Badge>}
    </span>
  );
}

// ---- Vehicles --------------------------------------------------------------------

function vehicleFields(categories: { value: number; label: string }[]): FieldDef[] {
  return [
    { name: "regNumber", label: "Registration number", required: true },
    { name: "categoryId", label: "Category", type: "select", numeric: true, options: categories },
    { name: "make", label: "Make", required: true },
    { name: "model", label: "Model", required: true },
    { name: "year", label: "Year of manufacture", type: "number", step: "1" },
    { name: "colour", label: "Colour" },
    { name: "transmission", label: "Transmission", type: "select", options: [{ value: "AUTOMATIC", label: "Automatic" }, { value: "MANUAL", label: "Manual" }] },
    { name: "country", label: "Country of origin" },
    { name: "chassisNumber", label: "Chassis number" },
    { name: "engineNumber", label: "Engine number" },
    { name: "tyreSize", label: "Tyre size" },
    { name: "roadworthyExpiry", label: "Roadworthy expires", type: "date" },
    { name: "insuranceExpiry", label: "Insurance expires", type: "date" },
    { name: "nextServiceDate", label: "Next service date", type: "date" },
    { name: "nextServiceOdometer", label: "Next service odometer (km)", type: "number", step: "1" },
    { name: "active", label: "Active (available for bookings)", type: "checkbox" },
  ];
}

function VehicleModal({ vehicle, onClose }: { vehicle?: Vehicle; onClose: () => void }) {
  const categories = useVehicleCategories();
  const navigate = useNavigate();
  const save = useSave(
    (body: object) => (vehicle ? api.put<Vehicle>(`/vehicles/${vehicle.id}`, body) : api.post<Vehicle>("/vehicles", body)),
    ["/vehicles"],
  );
  if (categories.isLoading) return null;
  return (
    <Modal title={vehicle ? `Edit ${vehicle.regNumber}` : "Add vehicle"} onClose={onClose}>
      <EntityForm
        fields={vehicleFields(options.vehicleCategories(categories.data))}
        initial={vehicle}
        onCancel={onClose}
        onSubmit={async (body) => {
          const v = await save.mutateAsync(body);
          onClose();
          if (!vehicle) navigate(`/vehicles/${v.id}`);
        }}
      />
    </Modal>
  );
}

export function VehicleList() {
  const { data, isLoading, error } = useVehicles();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const { q, setQ, filtered } = useSearch(data, (v) => [v.regNumber, v.make, v.model, v.category?.name]);

  return (
    <>
      <PageHeader title="Vehicles" subtitle="The full fleet with renewal dates." actions={<button className="btn btn-primary" onClick={() => setAdding(true)}>Add vehicle</button>} />
      <div className="toolbar">
        <input className="input" placeholder="Search reg., make, model…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ErrorAlert error={error} />
      <Card padded={false}>
        {isLoading ? (
          <Spinner />
        ) : (
          <DataTable
            rows={filtered}
            rowKey={(v) => v.id}
            onRowClick={(v) => navigate(`/vehicles/${v.id}`)}
            columns={[
              { key: "regNumber", header: "Reg. number", render: (v) => <strong>{v.regNumber}</strong> },
              { key: "make", header: "Vehicle", render: (v) => `${v.make} ${v.model}${v.year ? ` (${v.year})` : ""}` },
              { key: "category", header: "Category", hideSm: true, value: (v) => v.category?.name, render: (v) => v.category?.name ?? "—" },
              { key: "roadworthyExpiry", header: "Roadworthy", render: (v) => <ExpiryBadge date={v.roadworthyExpiry} /> },
              { key: "insuranceExpiry", header: "Insurance", render: (v) => <ExpiryBadge date={v.insuranceExpiry} /> },
              { key: "active", header: "Status", hideSm: true, render: (v) => (v.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>) },
            ]}
          />
        )}
      </Card>
      {adding && <VehicleModal onClose={() => setAdding(false)} />}
    </>
  );
}

export function VehicleDetail() {
  const { id } = useParams();
  const { data: v, isLoading, error } = useApi<Vehicle>(`/vehicles/${id}`);
  const services = useApi<ServiceRecord[]>(`/vehicles/${id}/service-records`);
  const [editing, setEditing] = useState(false);
  if (isLoading) return <Spinner />;
  if (!v) return <ErrorAlert error={error} />;
  const spend = services.data?.reduce((s, r) => s + Number(r.amount), 0) ?? 0;

  return (
    <>
      <PageHeader
        title={v.regNumber}
        subtitle={`${v.make} ${v.model}${v.category ? ` · ${v.category.name}` : ""}`}
        actions={
          <>
            <Link className="btn" to={`/service-records?vehicleId=${v.id}&new=1`}>Add service record</Link>
            <button className="btn btn-primary" onClick={() => setEditing(true)}>Edit</button>
          </>
        }
      />
      <div className="grid grid-2">
        <Card title="Details">
          <Details
            items={[
              ["Make / model", `${v.make} ${v.model}`],
              ["Category", v.category?.name],
              ["Year", v.year],
              ["Colour", v.colour],
              ["Transmission", v.transmission],
              ["Country", v.country],
              ["Chassis no.", v.chassisNumber],
              ["Engine no.", v.engineNumber],
              ["Tyre size", v.tyreSize],
              ["Status", v.active ? "Active" : "Inactive"],
            ]}
          />
        </Card>
        <Card title="Compliance & servicing">
          <Details
            items={[
              ["Roadworthy", <ExpiryBadge date={v.roadworthyExpiry} />],
              ["Insurance", <ExpiryBadge date={v.insuranceExpiry} />],
              ["Next service", <ExpiryBadge date={v.nextServiceDate} />],
              ["Next service at", v.nextServiceOdometer ? `${v.nextServiceOdometer.toLocaleString()} km` : "—"],
              ["Service records", services.data?.length ?? "…"],
              ["Total service spend", fmtMoney(spend, "GHS")],
            ]}
          />
        </Card>
      </div>
      <div style={{ marginTop: 16 }}>
        <Card title="Service history" padded={false}>
          {services.isLoading ? <Spinner /> : <ServiceTable rows={services.data ?? []} hideVehicle />}
        </Card>
      </div>
      {editing && <VehicleModal vehicle={v} onClose={() => setEditing(false)} />}
    </>
  );
}

// ---- Service records ------------------------------------------------------------

function ServiceTable({ rows, hideVehicle, onEdit }: { rows: ServiceRecord[]; hideVehicle?: boolean; onEdit?: (r: ServiceRecord) => void }) {
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.id}
      onRowClick={onEdit}
      empty="No service records."
      initialSort={{ key: "serviceDate", dir: "desc" }}
      columns={[
        { key: "serviceDate", header: "Date", render: (r) => <span className="nowrap">{fmtDate(r.serviceDate)}</span> },
        ...(hideVehicle ? [] : [{ key: "vehicle", header: "Vehicle", value: (r: ServiceRecord) => r.vehicle.regNumber, render: (r: ServiceRecord) => <Link to={`/vehicles/${r.vehicle.id}`} onClick={(e) => e.stopPropagation()}>{r.vehicle.regNumber}</Link> }]),
        { key: "garage", header: "Garage", render: (r) => <>{r.garage}<div className="muted small">{r.garageLocation}</div></> },
        { key: "details", header: "Work done", hideSm: true, render: (r) => r.details ?? "—" },
        { key: "odometer", header: "Odometer", align: "right", hideSm: true, render: (r) => (r.odometer ? r.odometer.toLocaleString() : "—") },
        { key: "driver", header: "Driver", hideSm: true, value: (r) => r.driver?.firstName, render: (r) => (r.driver ? `${r.driver.firstName} ${r.driver.lastName}` : "—") },
        { key: "amount", header: "Amount (GH₵)", align: "right", value: (r) => Number(r.amount), render: (r) => <span className="mono">{fmtMoney(r.amount)}</span> },
      ]}
    />
  );
}

function ServiceModal({ record, vehicleId, onClose }: { record?: ServiceRecord; vehicleId?: number; onClose: () => void }) {
  const vehicles = useVehicles();
  const drivers = useDrivers();
  const { isAdmin } = useAuth();
  const save = useSave(
    (body: object) => (record ? api.put(`/service-records/${record.id}`, body) : api.post("/service-records", body)),
    ["/service-records", "/vehicles"],
  );
  const del = useSave(() => api.del(`/service-records/${record!.id}`), ["/service-records", "/vehicles"]);
  if (vehicles.isLoading || drivers.isLoading) return null;
  return (
    <Modal title={record ? "Edit service record" : "Add service record"} onClose={onClose}>
      <EntityForm
        fields={[
          { name: "vehicleId", label: "Vehicle", type: "select", numeric: true, required: true, options: options.vehicles(vehicles.data) },
          { name: "serviceDate", label: "Service date", type: "date", required: true },
          { name: "garage", label: "Garage", required: true },
          { name: "garageLocation", label: "Garage location" },
          { name: "odometer", label: "Odometer (km)", type: "number", step: "1" },
          { name: "driverId", label: "Driver", type: "select", numeric: true, options: options.drivers(drivers.data) },
          { name: "amount", label: "Amount (GH₵)", type: "number", step: "0.01" },
          { name: "details", label: "Work done", type: "textarea", span: 2 },
        ]}
        initial={record ?? { vehicleId, serviceDate: today(), amount: 0 }}
        onCancel={onClose}
        onSubmit={async (body) => {
          await save.mutateAsync(body);
          onClose();
        }}
      />
      {record && isAdmin && (
        <button
          className="btn btn-danger btn-sm"
          onClick={() => window.confirm("Delete this service record?") && del.mutate(undefined, { onSuccess: onClose })}
        >
          Delete record
        </button>
      )}
    </Modal>
  );
}

export function ServiceRecordList() {
  const [params, setParams] = useSearchParams();
  const vehicleId = params.get("vehicleId");
  const vehicles = useVehicles();
  const { data, isLoading, error } = useApi<ServiceRecord[]>(`/service-records${vehicleId ? `?vehicleId=${vehicleId}` : ""}`);
  const [editing, setEditing] = useState<ServiceRecord | "new" | null>(params.get("new") ? "new" : null);
  const { q, setQ, filtered } = useSearch(data, (r) => [r.vehicle.regNumber, r.garage, r.details, r.garageLocation]);
  const total = filtered.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <>
      <PageHeader title="Service records" subtitle="Maintenance and repairs across the fleet." actions={<button className="btn btn-primary" onClick={() => setEditing("new")}>Add service record</button>} />
      <div className="toolbar">
        <select className="input" style={{ maxWidth: 260 }} value={vehicleId ?? ""} onChange={(e) => setParams(e.target.value ? { vehicleId: e.target.value } : {})}>
          <option value="">All vehicles</option>
          {vehicles.data?.map((v) => <option key={v.id} value={v.id}>{v.regNumber}</option>)}
        </select>
        <input className="input" placeholder="Search garage, work done…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted small">{filtered.length} records · GH₵{fmtMoney(total)}</span>
      </div>
      <ErrorAlert error={error} />
      <Card padded={false}>{isLoading ? <Spinner /> : <ServiceTable rows={filtered} onEdit={setEditing} />}</Card>
      {editing && (
        <ServiceModal
          record={editing === "new" ? undefined : editing}
          vehicleId={vehicleId ? Number(vehicleId) : undefined}
          onClose={() => {
            setEditing(null);
            if (params.get("new")) setParams(vehicleId ? { vehicleId } : {});
          }}
        />
      )}
    </>
  );
}

// ---- Drivers ---------------------------------------------------------------------

const driverFields: FieldDef[] = [
  { name: "firstName", label: "First name", required: true },
  { name: "lastName", label: "Last name", required: true },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "licenceClass", label: "Licence class" },
  { name: "designation", label: "Designation" },
  { name: "inService", label: "In service (available for assignment)", type: "checkbox" },
];

function DriverModal({ driver, onClose }: { driver?: Driver; onClose: () => void }) {
  const save = useSave(
    (body: object) => (driver ? api.put(`/drivers/${driver.id}`, body) : api.post("/drivers", body)),
    ["/drivers"],
  );
  return (
    <Modal title={driver ? `Edit ${driver.fullName}` : "Add driver"} onClose={onClose}>
      <EntityForm
        fields={driverFields}
        initial={driver}
        onCancel={onClose}
        onSubmit={async (body) => {
          await save.mutateAsync(body);
          onClose();
        }}
      />
    </Modal>
  );
}

export function DriverList() {
  const { data, isLoading, error } = useDrivers();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const visible = data?.filter((d) => showAll || d.inService);
  const { q, setQ, filtered } = useSearch(visible, (d) => [d.fullName, d.phone, d.licenceClass]);

  return (
    <>
      <PageHeader title="Drivers" actions={<button className="btn btn-primary" onClick={() => setAdding(true)}>Add driver</button>} />
      <div className="toolbar">
        <input className="input" placeholder="Search name, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="checkbox small">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Include drivers not in service
        </label>
      </div>
      <ErrorAlert error={error} />
      <Card padded={false}>
        {isLoading ? (
          <Spinner />
        ) : (
          <DataTable
            rows={filtered}
            rowKey={(d) => d.id}
            onRowClick={(d) => navigate(`/drivers/${d.id}`)}
            columns={[
              { key: "fullName", header: "Name", render: (d) => <strong>{d.fullName}</strong> },
              { key: "phone", header: "Phone" },
              { key: "licenceClass", header: "Licence", hideSm: true },
              { key: "designation", header: "Designation", hideSm: true },
              { key: "trips", header: "Trips", align: "right", hideSm: true, value: (d) => d._count.reservations, render: (d) => d._count.reservations },
              { key: "inService", header: "Status", render: (d) => (d.inService ? <Badge tone="success">In service</Badge> : <Badge>Not in service</Badge>) },
            ]}
          />
        )}
      </Card>
      {adding && <DriverModal onClose={() => setAdding(false)} />}
    </>
  );
}

export function DriverDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: d, isLoading, error } = useApi<Driver>(`/drivers/${id}`);
  const trips = useApi<(Reservation & { vehicle: { regNumber: string } | null })[]>(`/drivers/${id}/trips`);
  const [editing, setEditing] = useState(false);
  if (isLoading) return <Spinner />;
  if (!d) return <ErrorAlert error={error} />;
  const closed = trips.data?.filter((t) => t.status === "CLOSED") ?? [];
  const days = closed.reduce((s, t) => s + Math.round((Date.parse(t.endDate) - Date.parse(t.startDate)) / 86400000) + 1, 0);

  return (
    <>
      <PageHeader title={d.fullName} subtitle={d.inService ? "In service" : "Not in service"} actions={<button className="btn btn-primary" onClick={() => setEditing(true)}>Edit</button>} />
      <div className="grid grid-2">
        <Card title="Details">
          <Details items={[["Phone", d.phone], ["Licence class", d.licenceClass], ["Designation", d.designation]]} />
        </Card>
        <Card title="Activity">
          <Details items={[["Trips assigned", trips.data?.length ?? "…"], ["Completed trips", closed.length], ["Days on the road", days]]} />
        </Card>
      </div>
      <div style={{ marginTop: 16 }}>
        <Card title="Trip history" padded={false}>
          {trips.isLoading ? (
            <Spinner />
          ) : (
            <DataTable
              rows={trips.data ?? []}
              rowKey={(t) => t.id}
              onRowClick={(t) => navigate(`/reservations/${t.id}`)}
              empty="No trips yet."
              columns={[
                { key: "id", header: "#" },
                { key: "startDate", header: "Dates", render: (t) => <span className="nowrap">{fmtDate(t.startDate)} – {fmtDate(t.endDate)}</span> },
                { key: "companyName", header: "Customer" },
                { key: "destination", header: "Destination" },
                { key: "vehicle", header: "Vehicle", value: (t) => t.vehicle?.regNumber, render: (t) => t.vehicle?.regNumber ?? "—" },
                { key: "status", header: "Status", render: (t) => <StatusBadge status={t.status} /> },
              ]}
            />
          )}
        </Card>
      </div>
      {editing && <DriverModal driver={d} onClose={() => setEditing(false)} />}
    </>
  );
}

// ---- Vendors ---------------------------------------------------------------------

function VendorModal({ vendor, onClose }: { vendor?: Vendor; onClose: () => void }) {
  const categories = useVendorCategories();
  const { isAdmin } = useAuth();
  const save = useSave(
    (body: object) => (vendor ? api.put(`/vendors/${vendor.id}`, body) : api.post("/vendors", body)),
    ["/vendors"],
  );
  const del = useSave(() => api.del(`/vendors/${vendor!.id}`), ["/vendors"]);
  if (categories.isLoading) return null;
  return (
    <Modal title={vendor ? `Edit ${vendor.name}` : "Add vendor"} onClose={onClose}>
      <EntityForm
        fields={[
          { name: "name", label: "Vendor name", required: true, span: 2 },
          { name: "categoryId", label: "Category", type: "select", numeric: true, options: options.vendorCategories(categories.data) },
          { name: "contactPerson", label: "Contact person" },
          { name: "phone", label: "Phone", type: "tel" },
          { name: "address", label: "Address" },
          { name: "paymentType", label: "Payment type", type: "select", options: ["CASH", "CHEQUE", "CREDIT", "MOBILE MONEY", "BANK TRANSFER"].map((p) => ({ value: p, label: p })) },
          { name: "creditTermDays", label: "Credit term (days)", type: "number", step: "1" },
        ]}
        initial={vendor}
        onCancel={onClose}
        onSubmit={async (body) => {
          await save.mutateAsync(body);
          onClose();
        }}
      />
      <ErrorAlert error={del.error} />
      {vendor && isAdmin && (
        <button className="btn btn-danger btn-sm" onClick={() => window.confirm(`Delete ${vendor.name}?`) && del.mutate(undefined, { onSuccess: onClose })}>
          Delete vendor
        </button>
      )}
    </Modal>
  );
}

export function VendorList() {
  const { data, isLoading, error } = useApi<Vendor[]>("/vendors");
  const [editing, setEditing] = useState<Vendor | "new" | null>(null);
  const { q, setQ, filtered } = useSearch(data, (v) => [v.name, v.contactPerson, v.phone, v.category?.name]);

  return (
    <>
      <PageHeader title="Vendors" subtitle="Suppliers for parts, repairs and services." actions={<button className="btn btn-primary" onClick={() => setEditing("new")}>Add vendor</button>} />
      <div className="toolbar">
        <input className="input" placeholder="Search vendors…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ErrorAlert error={error} />
      <Card padded={false}>
        {isLoading ? (
          <Spinner />
        ) : (
          <DataTable
            rows={filtered}
            rowKey={(v) => v.id}
            onRowClick={setEditing}
            columns={[
              { key: "name", header: "Vendor", render: (v) => <strong>{v.name}</strong> },
              { key: "category", header: "Category", hideSm: true, value: (v) => v.category?.name, render: (v) => v.category?.name ?? "—" },
              { key: "contactPerson", header: "Contact", hideSm: true },
              { key: "phone", header: "Phone" },
              { key: "paymentType", header: "Payment", hideSm: true, render: (v) => (v.paymentType ? `${v.paymentType}${v.creditTermDays ? ` · ${v.creditTermDays} days` : ""}` : "—") },
            ]}
          />
        )}
      </Card>
      {editing && <VendorModal vendor={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
