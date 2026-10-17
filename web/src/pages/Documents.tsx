import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQueries } from "@tanstack/react-query";
import { api } from "../api";
import { useAuth } from "../auth";
import { useApi, useSave, useVehicles, useVendors } from "../hooks";
import { fmtDate, fmtMoney, toInputDate, today } from "../format";
import { DataTable, useSearch } from "../components/DataTable";
import { blankItem, LineItemsEditor, toPayloadItems, type EditableItem } from "../components/LineItems";
import { Card, ErrorAlert, Field, PageHeader, Spinner, StatusBadge } from "../components/ui";
import type { Invoice, POStatus, PurchaseOrder, Reservation } from "../types";

// ---- Purchase orders -------------------------------------------------------------

const PO_STATUSES: POStatus[] = ["PENDING", "APPROVED", "RECEIVED", "CANCELLED"];

export function PurchaseOrderList() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const navigate = useNavigate();
  const { data, isLoading, error } = useApi<PurchaseOrder[]>(`/purchase-orders${status ? `?status=${status}` : ""}`);
  const { q, setQ, filtered } = useSearch(data, (p) => [p.number, p.vendor.name, p.vehicle?.regNumber, ...p.items.map((i) => i.description)]);

  return (
    <>
      <PageHeader title="Purchase orders" actions={<Link className="btn btn-primary" to="/purchase-orders/new">New purchase order</Link>} />
      <div className="tabs">
        {(["", ...PO_STATUSES] as const).map((s) => (
          <button key={s || "all"} className={status === s ? "active" : ""} onClick={() => setParams(s ? { status: s } : {})}>
            {s ? s.charAt(0) + s.slice(1).toLowerCase() : "All"}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <input className="input" placeholder="Search number, vendor, item…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ErrorAlert error={error} />
      <Card padded={false}>
        {isLoading ? (
          <Spinner />
        ) : (
          <DataTable
            rows={filtered}
            rowKey={(p) => p.id}
            onRowClick={(p) => navigate(`/purchase-orders/${p.id}`)}
            columns={[
              { key: "number", header: "PO number", render: (p) => <strong className="mono">{p.number}</strong> },
              { key: "orderDate", header: "Date", hideSm: true, render: (p) => <span className="nowrap">{fmtDate(p.orderDate)}</span> },
              { key: "vendor", header: "Vendor", value: (p) => p.vendor.name, render: (p) => p.vendor.name },
              { key: "items", header: "Items", sortable: false, hideSm: true, render: (p) => <span className="small">{p.items.map((i) => i.description).join(", ")}</span> },
              { key: "vehicle", header: "Vehicle", hideSm: true, value: (p) => p.vehicle?.regNumber, render: (p) => p.vehicle?.regNumber ?? "—" },
              { key: "total", header: "Total (GH₵)", align: "right", render: (p) => <span className="mono">{fmtMoney(p.total)}</span> },
              { key: "status", header: "Status", render: (p) => <StatusBadge status={p.status} /> },
            ]}
          />
        )}
      </Card>
    </>
  );
}

export function PurchaseOrderForm() {
  const { id } = useParams();
  const existing = useApi<PurchaseOrder>(id ? `/purchase-orders/${id}` : null);
  const vendors = useVendors();
  const vehicles = useVehicles();
  if ((id && existing.isLoading) || vendors.isLoading || vehicles.isLoading) return <Spinner />;
  if (id && !existing.data) return <ErrorAlert error={existing.error} />;
  return <PurchaseOrderFormInner po={existing.data} />;
}

function PurchaseOrderFormInner({ po }: { po?: PurchaseOrder }) {
  const navigate = useNavigate();
  const vendors = useVendors();
  const vehicles = useVehicles();
  const [orderDate, setOrderDate] = useState(toInputDate(po?.orderDate) || today());
  const [dueDate, setDueDate] = useState(toInputDate(po?.dueDate));
  const [vendorId, setVendorId] = useState(po ? String(po.vendorId) : "");
  const [vehicleId, setVehicleId] = useState(po?.vehicleId ? String(po.vehicleId) : "");
  const [status, setStatus] = useState<POStatus>(po?.status ?? "PENDING");
  const [notes, setNotes] = useState(po?.notes ?? "");
  const [items, setItems] = useState<EditableItem[]>(
    po?.items.map((i) => ({ description: i.description, unit: i.unit ?? "", quantity: String(Number(i.quantity)), unitPrice: String(Number(i.unitPrice)) })) ?? [blankItem()],
  );
  const save = useSave(
    (body: object) => (po ? api.put<PurchaseOrder>(`/purchase-orders/${po.id}`, body) : api.post<PurchaseOrder>("/purchase-orders", body)),
    ["/purchase-orders"],
  );

  // Pre-fill the due date from the vendor's credit terms.
  useEffect(() => {
    if (po || dueDate) return;
    const v = vendors.data?.find((x) => String(x.id) === vendorId);
    if (v?.creditTermDays) setDueDate(new Date(Date.parse(orderDate) + v.creditTermDays * 86400000).toISOString().slice(0, 10));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(
      {
        orderDate,
        dueDate: dueDate || null,
        vendorId: Number(vendorId),
        vehicleId: vehicleId ? Number(vehicleId) : null,
        status,
        notes: notes || null,
        items: toPayloadItems(items),
      },
      { onSuccess: (p) => navigate(`/purchase-orders/${p.id}`) },
    );
  };

  return (
    <>
      <PageHeader title={po ? `Edit ${po.number}` : "New purchase order"} />
      <form onSubmit={submit}>
        <ErrorAlert error={save.error} />
        <Card>
          <div className="form-grid">
            <Field label="Vendor *">
              <select className="input" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                <option value="">Select…</option>
                {vendors.data?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>
            <Field label="For vehicle">
              <select className="input" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                <option value="">— (general)</option>
                {vehicles.data?.map((v) => <option key={v.id} value={v.id}>{v.regNumber}</option>)}
              </select>
            </Field>
            <Field label="Order date *">
              <input className="input" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </Field>
            <Field label="Payment due">
              <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
            <Field label="Status">
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as POStatus)}>
                {PO_STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
              </select>
            </Field>
            <Field label="Notes">
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </Card>
        <div style={{ marginTop: 16 }}>
          <Card title="Items" padded={false}>
            <LineItemsEditor items={items} onChange={setItems} showUnit currency="GHS" />
          </Card>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={() => navigate(-1)}>Cancel</button>
          <button className="btn btn-primary" disabled={save.isPending || !vendorId}>{save.isPending ? "Saving…" : "Save purchase order"}</button>
        </div>
      </form>
    </>
  );
}

export function PurchaseOrderView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { data: po, isLoading, error } = useApi<PurchaseOrder>(`/purchase-orders/${id}`);
  const del = useSave(() => api.del(`/purchase-orders/${id}`), ["/purchase-orders"]);
  if (isLoading) return <Spinner />;
  if (!po) return <ErrorAlert error={error} />;

  return (
    <div className="doc">
      <PageHeader
        title={<>{po.number} <StatusBadge status={po.status} /></>}
        actions={
          <>
            <button className="btn" onClick={() => window.print()}>Print</button>
            {isAdmin && (
              <button className="btn btn-danger" onClick={() => window.confirm(`Delete ${po.number}?`) && del.mutate(undefined, { onSuccess: () => navigate("/purchase-orders") })}>
                Delete
              </button>
            )}
            <Link className="btn btn-primary" to={`/purchase-orders/${po.id}/edit`}>Edit</Link>
          </>
        }
      />
      <ErrorAlert error={del.error} />
      <Card>
        <div className="doc-head">
          <div>
            <div className="doc-title">PURCHASE ORDER</div>
            <div className="mono">{po.number}</div>
          </div>
          <div className="right">
            <div>Date: <strong>{fmtDate(po.orderDate)}</strong></div>
            {po.dueDate && <div>Payment due: <strong>{fmtDate(po.dueDate)}</strong></div>}
            {po.vehicle && <div>Vehicle: <strong>{po.vehicle.regNumber}</strong></div>}
          </div>
        </div>
        <div style={{ marginBottom: 18 }}>
          <div className="muted small">VENDOR</div>
          <strong>{po.vendor.name}</strong>
          {po.vendor.address && <div>{po.vendor.address}</div>}
          {po.vendor.phone && <div>{po.vendor.phone}</div>}
          {po.vendor.contactPerson && <div>Attn: {po.vendor.contactPerson}</div>}
        </div>
        <table className="table">
          <thead>
            <tr><th>Description</th><th>Unit</th><th className="right">Qty</th><th className="right">Unit price</th><th className="right">Total</th></tr>
          </thead>
          <tbody>
            {po.items.map((i) => (
              <tr key={i.id}>
                <td>{i.description}</td>
                <td>{i.unit ?? ""}</td>
                <td className="right mono">{Number(i.quantity)}</td>
                <td className="right mono">{fmtMoney(i.unitPrice)}</td>
                <td className="right mono">{fmtMoney(i.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={4} className="right">Total (GH₵)</td><td className="right mono">{fmtMoney(po.total)}</td></tr>
          </tfoot>
        </table>
        {po.notes && <p><span className="muted">Notes:</span> {po.notes}</p>}
        <p className="muted small" style={{ marginTop: 28 }}>Raised by {po.createdBy?.fullName ?? "—"}</p>
      </Card>
    </div>
  );
}

// ---- Pro-forma invoices ----------------------------------------------------------

export function InvoiceList() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useApi<Invoice[]>("/invoices");
  const { q, setQ, filtered } = useSearch(data, (i) => [i.number, i.customerName]);
  return (
    <>
      <PageHeader
        title="Pro-forma invoices"
        subtitle="Create one from a closed reservation, or start blank and add several trips."
        actions={<Link className="btn btn-primary" to="/invoices/new">New invoice</Link>}
      />
      <div className="toolbar">
        <input className="input" placeholder="Search number or customer…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ErrorAlert error={error} />
      <Card padded={false}>
        {isLoading ? (
          <Spinner />
        ) : (
          <DataTable
            rows={filtered}
            rowKey={(i) => i.id}
            onRowClick={(i) => navigate(`/invoices/${i.id}`)}
            columns={[
              { key: "number", header: "Number", render: (i) => <strong className="mono">{i.number}</strong> },
              { key: "invoiceDate", header: "Date", render: (i) => <span className="nowrap">{fmtDate(i.invoiceDate)}</span> },
              { key: "customerName", header: "Customer" },
              { key: "totalUsd", header: "Total", align: "right", render: (i) => <span className="mono">{fmtMoney(i.totalUsd, "USD")}</span> },
              { key: "amountDueUsd", header: "Due", align: "right", hideSm: true, render: (i) => <span className="mono">{fmtMoney(i.amountDueUsd, "USD")}</span> },
            ]}
          />
        )}
      </Card>
    </>
  );
}

function reservationItem(r: Reservation): EditableItem {
  return {
    description: `#${r.id} ${r.rate?.description ?? r.vehicleCategory?.name ?? "Vehicle hire"} — ${r.destination} (${fmtDate(r.startDate)} – ${fmtDate(r.endDate)})`,
    quantity: String(r.days),
    unitPrice: r.rate ? String(r.estimatedTotalUsd != null ? r.estimatedTotalUsd / r.days : "") : "",
    rateId: r.rateId,
    reservationId: r.id,
  };
}

export function InvoiceForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const existing = useApi<Invoice>(id ? `/invoices/${id}` : null);
  const ids = (params.get("reservations") ?? "").split(",").filter(Boolean);
  const reservations = useQueries({
    queries: ids.map((rid) => ({ queryKey: [`/reservations/${rid}`], queryFn: () => api.get<Reservation>(`/reservations/${rid}`) })),
  });
  if ((id && existing.isLoading) || reservations.some((q) => q.isLoading)) return <Spinner />;
  if (id && !existing.data) return <ErrorAlert error={existing.error} />;
  return <InvoiceFormInner invoice={existing.data} fromReservations={reservations.flatMap((q) => (q.data ? [q.data] : []))} />;
}

function InvoiceFormInner({ invoice, fromReservations }: { invoice?: Invoice; fromReservations: Reservation[] }) {
  const navigate = useNavigate();
  const first = fromReservations[0];
  const [invoiceDate, setInvoiceDate] = useState(toInputDate(invoice?.invoiceDate) || today());
  const [customerName, setCustomerName] = useState(invoice?.customerName ?? first?.companyName ?? "");
  const [customerAddress, setCustomerAddress] = useState(invoice?.customerAddress ?? "");
  const [usdToGhs, setUsdToGhs] = useState(invoice?.usdToGhs != null ? String(Number(invoice.usdToGhs)) : "");
  const [amountPaid, setAmountPaid] = useState(invoice ? String(Number(invoice.amountPaid)) : "0");
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [items, setItems] = useState<EditableItem[]>(
    invoice?.items.map((i) => ({
      description: i.description,
      quantity: String(Number(i.quantity)),
      unitPrice: String(Number(i.unitPrice)),
      rateId: i.rateId,
      reservationId: i.reservationId,
    })) ?? (fromReservations.length ? fromReservations.map(reservationItem) : [blankItem()]),
  );
  const [addId, setAddId] = useState("");

  // Closed reservations for this customer that aren't on the invoice yet ("multi RPF").
  const closed = useApi<Reservation[]>("/reservations?status=CLOSED");
  const candidates = useMemo(() => {
    const used = new Set(items.map((i) => i.reservationId));
    const name = customerName.trim().toUpperCase();
    return (closed.data ?? []).filter((r) => !used.has(r.id) && (!name || r.companyName === name)).slice(0, 200);
  }, [closed.data, items, customerName]);

  const save = useSave(
    (body: object) => (invoice ? api.put<Invoice>(`/invoices/${invoice.id}`, body) : api.post<Invoice>("/invoices", body)),
    ["/invoices"],
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(
      {
        invoiceDate,
        customerName,
        customerAddress: customerAddress || null,
        usdToGhs: usdToGhs ? Number(usdToGhs) : null,
        amountPaid: Number(amountPaid || 0),
        notes: notes || null,
        items: toPayloadItems(items).map(({ unit: _unit, ...rest }) => rest),
      },
      { onSuccess: (inv) => navigate(`/invoices/${inv.id}`) },
    );
  };

  const addReservation = () => {
    const r = closed.data?.find((x) => String(x.id) === addId);
    if (!r) return;
    const blankOnly = items.length === 1 && !items[0].description;
    setItems(blankOnly ? [reservationItem(r)] : [...items, reservationItem(r)]);
    if (!customerName) setCustomerName(r.companyName);
    setAddId("");
  };

  return (
    <>
      <PageHeader title={invoice ? `Edit ${invoice.number}` : "New pro-forma invoice"} />
      <form onSubmit={submit}>
        <ErrorAlert error={save.error} />
        <Card>
          <div className="form-grid">
            <Field label="Customer *">
              <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </Field>
            <Field label="Invoice date *">
              <input className="input" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </Field>
            <Field label="Customer address" className="span-2">
              <input className="input" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
            </Field>
            <Field label="USD → GHS rate" hint="Leave empty to use the rate in effect on the invoice date.">
              <input className="input" type="number" step="0.0001" min="0" value={usdToGhs} onChange={(e) => setUsdToGhs(e.target.value)} />
            </Field>
            <Field label="Amount paid (USD)">
              <input className="input" type="number" step="0.01" min="0" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />
            </Field>
            <Field label="Notes" className="span-2">
              <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </Card>
        <div style={{ marginTop: 16 }}>
          <Card
            title="Items (USD)"
            padded={false}
            actions={
              <>
                <select className="input" style={{ maxWidth: 320 }} value={addId} onChange={(e) => setAddId(e.target.value)} aria-label="Add a closed reservation">
                  <option value="">Add a closed reservation…</option>
                  {candidates.map((r) => (
                    <option key={r.id} value={r.id}>#{r.id} {r.companyName} — {r.destination}, {fmtDate(r.startDate)}</option>
                  ))}
                </select>
                <button type="button" className="btn btn-sm" disabled={!addId} onClick={addReservation}>Add</button>
              </>
            }
          >
            <LineItemsEditor items={items} onChange={setItems} currency="USD" quantityLabel="Days / qty" />
          </Card>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={() => navigate(-1)}>Cancel</button>
          <button className="btn btn-primary" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save invoice"}</button>
        </div>
      </form>
    </>
  );
}

export function InvoiceView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { data: inv, isLoading, error } = useApi<Invoice>(`/invoices/${id}`);
  const del = useSave(() => api.del(`/invoices/${id}`), ["/invoices"]);
  if (isLoading) return <Spinner />;
  if (!inv) return <ErrorAlert error={error} />;

  return (
    <div className="doc">
      <PageHeader
        title={inv.number}
        actions={
          <>
            <button className="btn" onClick={() => window.print()}>Print</button>
            {isAdmin && (
              <button className="btn btn-danger" onClick={() => window.confirm(`Delete ${inv.number}?`) && del.mutate(undefined, { onSuccess: () => navigate("/invoices") })}>
                Delete
              </button>
            )}
            <Link className="btn btn-primary" to={`/invoices/${inv.id}/edit`}>Edit</Link>
          </>
        }
      />
      <ErrorAlert error={del.error} />
      <Card>
        <div className="doc-head">
          <div>
            <div className="doc-title">PRO-FORMA INVOICE</div>
            <div className="mono">{inv.number}</div>
          </div>
          <div className="right">
            <div>Date: <strong>{fmtDate(inv.invoiceDate)}</strong></div>
            {inv.usdToGhs != null && <div className="small muted">Rate: US$1 = GH₵{Number(inv.usdToGhs).toFixed(4)}</div>}
          </div>
        </div>
        <div style={{ marginBottom: 18 }}>
          <div className="muted small">BILL TO</div>
          <strong>{inv.customerName}</strong>
          {inv.customerAddress && <div>{inv.customerAddress}</div>}
        </div>
        <table className="table">
          <thead>
            <tr><th>Description</th><th className="right">Days / qty</th><th className="right">Rate (USD)</th><th className="right">Amount (USD)</th></tr>
          </thead>
          <tbody>
            {inv.items.map((i) => (
              <tr key={i.id}>
                <td>{i.description}</td>
                <td className="right mono">{Number(i.quantity)}</td>
                <td className="right mono">{fmtMoney(i.unitPrice)}</td>
                <td className="right mono">{fmtMoney(i.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={3} className="right">Total</td><td className="right mono">{fmtMoney(inv.totalUsd, "USD")}</td></tr>
            {Number(inv.amountPaid) > 0 && (
              <>
                <tr><td colSpan={3} className="right">Paid</td><td className="right mono">{fmtMoney(inv.amountPaid, "USD")}</td></tr>
                <tr><td colSpan={3} className="right">Amount due</td><td className="right mono">{fmtMoney(inv.amountDueUsd, "USD")}</td></tr>
              </>
            )}
            {inv.totalGhs != null && (
              <tr><td colSpan={3} className="right">Total in cedis</td><td className="right mono">{fmtMoney(inv.totalGhs, "GHS")}</td></tr>
            )}
          </tfoot>
        </table>
        {inv.notes && <p style={{ whiteSpace: "pre-wrap" }}>{inv.notes}</p>}
        <p className="muted small" style={{ marginTop: 28 }}>Prepared by {inv.createdBy?.fullName ?? "—"}</p>
      </Card>
    </div>
  );
}
