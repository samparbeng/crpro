import { Link, Navigate, Route, Routes } from "react-router";
import { useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { PageHeader, Spinner } from "./components/ui";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { ReservationDetail, ReservationForm, ReservationList } from "./pages/Reservations";
import { DriverDetail, DriverList, ServiceRecordList, VehicleDetail, VehicleList, VendorList } from "./pages/Fleet";
import {
  InvoiceForm,
  InvoiceList,
  InvoiceView,
  PurchaseOrderForm,
  PurchaseOrderList,
  PurchaseOrderView,
} from "./pages/Documents";
import { Account, RateList, Reports, Settings, UserList } from "./pages/Admin";

function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" />
      <Link to="/">Back to the dashboard</Link>
    </>
  );
}

export function App() {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Login />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="reservations" element={<ReservationList />} />
        <Route path="reservations/new" element={<ReservationForm />} />
        <Route path="reservations/:id" element={<ReservationDetail />} />
        <Route path="reservations/:id/edit" element={<ReservationForm />} />
        <Route path="drivers" element={<DriverList />} />
        <Route path="drivers/:id" element={<DriverDetail />} />
        <Route path="vehicles" element={<VehicleList />} />
        <Route path="vehicles/:id" element={<VehicleDetail />} />
        <Route path="service-records" element={<ServiceRecordList />} />
        <Route path="vendors" element={<VendorList />} />
        <Route path="purchase-orders" element={<PurchaseOrderList />} />
        <Route path="purchase-orders/new" element={<PurchaseOrderForm />} />
        <Route path="purchase-orders/:id" element={<PurchaseOrderView />} />
        <Route path="purchase-orders/:id/edit" element={<PurchaseOrderForm />} />
        <Route path="invoices" element={<InvoiceList />} />
        <Route path="invoices/new" element={<InvoiceForm />} />
        <Route path="invoices/:id" element={<InvoiceView />} />
        <Route path="invoices/:id/edit" element={<InvoiceForm />} />
        <Route path="rates" element={<RateList />} />
        <Route path="settings" element={<Settings />} />
        <Route path="users" element={isAdmin ? <UserList /> : <Navigate to="/" replace />} />
        <Route path="account" element={<Account />} />
        <Route path="reports" element={<Reports />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
