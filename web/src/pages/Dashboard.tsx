import { useState } from "react";
import { Link } from "react-router";
import { api } from "../api";
import { useAuth } from "../auth";
import { useApi, useSave } from "../hooks";
import { daysUntil, dueLabel, fmtDate } from "../format";
import { Badge, Card, ErrorAlert, PageHeader, Spinner, StatusBadge } from "../components/ui";
import type { ExchangeRate, ReservationStatus } from "../types";

type DueVehicle = { id: number; regNumber: string; make: string; model: string; roadworthyExpiry: string | null; insuranceExpiry: string | null; nextServiceDate?: string | null };

type DashboardData = {
  counts: {
    users: number;
    vehicles: number;
    drivers: number;
    vendors: number;
    pendingPurchaseOrders: number;
    reservations: Record<ReservationStatus | "total", number>;
  };
  renewalWindowDays: number;
  roadworthyDue: DueVehicle[];
  insuranceDue: DueVehicle[];
  serviceDue: DueVehicle[];
  upcomingReservations: { id: number; companyName: string; destination: string; startDate: string; endDate: string; status: ReservationStatus }[];
  exchangeRate: ExchangeRate | null;
  exchangeRateIsCurrent: boolean;
};

function DueList({ rows, field, empty }: { rows: DueVehicle[]; field: "roadworthyExpiry" | "insuranceExpiry" | "nextServiceDate"; empty: string }) {
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <table className="table">
      <tbody>
        {rows.map((v) => {
          const d = daysUntil(v[field]);
          return (
            <tr key={v.id}>
              <td>
                <Link to={`/vehicles/${v.id}`}>{v.regNumber}</Link>
                <div className="muted small">{v.make} {v.model}</div>
              </td>
              <td className="right nowrap">
                {fmtDate(v[field])}
                <div>
                  <Badge tone={d != null && d < 0 ? "danger" : d != null && d <= 14 ? "warning" : "neutral"}>{dueLabel(v[field])}</Badge>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ExchangeRateCard({ data }: { data: DashboardData }) {
  const { isAdmin } = useAuth();
  const [rate, setRate] = useState("");
  const save = useSave((usdToGhs: number) => api.post("/exchange-rates", { usdToGhs }), ["/exchange-rates"]);
  const current = data.exchangeRate;

  return (
    <Card title="Exchange rate">
      <div className="stat" style={{ padding: 0 }}>
        <div className="label">USD → GHS</div>
        <div className="value">{current ? Number(current.usdToGhs).toFixed(4) : "—"}</div>
        <div className="small muted">
          {current ? `Set for ${fmtDate(current.effectiveDate)}` : "No rate set yet"}{" "}
          {!data.exchangeRateIsCurrent && <Badge tone="warning">not set today</Badge>}
        </div>
      </div>
      {isAdmin && (
        <form
          className="actions"
          style={{ marginTop: 14 }}
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(Number(rate), { onSuccess: () => setRate("") });
          }}
        >
          <input className="input" style={{ maxWidth: 140 }} type="number" step="0.0001" min="0" placeholder="Today's rate" value={rate} onChange={(e) => setRate(e.target.value)} />
          <button className="btn btn-primary" disabled={!rate || save.isPending}>Set rate</button>
        </form>
      )}
      <ErrorAlert error={save.error} />
    </Card>
  );
}

export function Dashboard() {
  const { data, isLoading, error } = useApi<DashboardData>("/dashboard");
  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorAlert error={error} />;
  const c = data.counts;

  const stats: [string, number, string][] = [
    ["Pending reservations", c.reservations.PENDING, "/reservations?status=PENDING"],
    ["In progress", c.reservations.IN_PROGRESS, "/reservations?status=IN_PROGRESS"],
    ["All reservations", c.reservations.total, "/reservations"],
    ["Vehicles", c.vehicles, "/vehicles"],
    ["Drivers in service", c.drivers, "/drivers"],
    ["Vendors", c.vendors, "/vendors"],
    ["Pending POs", c.pendingPurchaseOrders, "/purchase-orders?status=PENDING"],
  ];

  return (
    <>
      <PageHeader title="Dashboard" actions={<Link className="btn btn-primary" to="/reservations/new">New reservation</Link>} />
      <div className="stats">
        {stats.map(([label, value, to]) => (
          <Link key={label} to={to} className="card stat">
            <div className="label">{label}</div>
            <div className="value">{value}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-3">
        <Card title="Starting in the next 7 days" padded={false}>
          {data.upcomingReservations.length ? (
            <table className="table">
              <tbody>
                {data.upcomingReservations.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/reservations/${r.id}`}>#{r.id} {r.companyName}</Link>
                      <div className="muted small">{r.destination}</div>
                    </td>
                    <td className="right nowrap">
                      {fmtDate(r.startDate)}
                      <div><StatusBadge status={r.status} /></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">No reservations starting this week.</div>
          )}
        </Card>
        <Card title={`Roadworthy renewals (${data.renewalWindowDays} days)`} padded={false}>
          <DueList rows={data.roadworthyDue} field="roadworthyExpiry" empty="Nothing due." />
        </Card>
        <Card title={`Insurance renewals (${data.renewalWindowDays} days)`} padded={false}>
          <DueList rows={data.insuranceDue} field="insuranceExpiry" empty="Nothing due." />
        </Card>
        <Card title="Service due (14 days)" padded={false}>
          <DueList rows={data.serviceDue} field="nextServiceDate" empty="No services due." />
        </Card>
        <ExchangeRateCard data={data} />
      </div>
    </>
  );
}
