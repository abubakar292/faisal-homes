import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import { LoginPage, ChangePasswordPage } from './pages/AuthPages.jsx';
import Dashboard from './pages/Dashboard.jsx';
import { LandsPage, LandDetailPage, LandLedgerPage } from './pages/Lands.jsx';
import InvestmentsPage from './pages/Investments.jsx';
import { SocietiesPage, SocietyDetailPage } from './pages/Societies.jsx';
import { PlotsPage, PlotDetailPage } from './pages/Plots.jsx';
import PlotMapPage from './pages/PlotMap.jsx';
import { CustomersPage, CustomerEditPage, CustomerProfilePage } from './pages/Customers.jsx';
import NewBookingPage from './pages/NewBooking.jsx';
import { BookingsPage, BookingDetailPage } from './pages/Bookings.jsx';
import { CollectPaymentPage, ReceiptsPage, ReceiptDetailPage } from './pages/Payments.jsx';
import InstallmentsPage from './pages/Installments.jsx';
import { TransfersPage, NewTransferPage, TransferDetailPage } from './pages/Transfers.jsx';
import ExpensesPage from './pages/Expenses.jsx';
import ReportsPage from './pages/Reports.jsx';
import SettingsPage from './pages/Settings.jsx';
import UsersPage from './pages/Users.jsx';
import AuditPage from './pages/Audit.jsx';
import BackupPage from './pages/Backup.jsx';

function Guard({ perm, children }) {
  const { can } = useAuth();
  if (perm && !can(perm)) {
    return <div className="card p-8 text-center text-slate-600">You do not have permission to open this page. Ask an administrator if you need access.</div>;
  }
  return children;
}

export default function App() {
  const { loading, user } = useAuth();
  if (loading) return <Loading text="Starting FAISAL HOMES…" />;
  if (!user) return <LoginPage />;
  if (user.must_change_password) return <ChangePasswordPage forced />;
  const G = (perm, el) => <Guard perm={perm}>{el}</Guard>;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="lands" element={G('land.view', <LandsPage />)} />
        <Route path="lands/:id" element={G('land.view', <LandDetailPage />)} />
        <Route path="lands/:id/ledger" element={G('land.view', <LandLedgerPage />)} />
        <Route path="investments" element={G('investment.view', <InvestmentsPage />)} />
        <Route path="societies" element={G('society.view', <SocietiesPage />)} />
        <Route path="societies/:id" element={G('society.view', <SocietyDetailPage />)} />
        <Route path="plots" element={G('plot.view', <PlotsPage />)} />
        <Route path="plots/:id" element={G('plot.view', <PlotDetailPage />)} />
        <Route path="plot-map" element={G('plot.view', <PlotMapPage />)} />
        <Route path="customers" element={G('customer.view', <CustomersPage />)} />
        <Route path="customers/new" element={G('customer.edit', <CustomerEditPage />)} />
        <Route path="customers/:id" element={G('customer.view', <CustomerProfilePage />)} />
        <Route path="customers/:id/edit" element={G('customer.edit', <CustomerEditPage />)} />
        <Route path="bookings" element={G('booking.view', <BookingsPage />)} />
        <Route path="bookings/new" element={G('booking.create', <NewBookingPage />)} />
        <Route path="bookings/:id" element={G('booking.view', <BookingDetailPage />)} />
        <Route path="collect" element={G('payment.create', <CollectPaymentPage />)} />
        <Route path="receipts" element={G('payment.view', <ReceiptsPage />)} />
        <Route path="receipts/:id" element={G('payment.view', <ReceiptDetailPage />)} />
        <Route path="installments" element={G('booking.view', <InstallmentsPage />)} />
        <Route path="transfers" element={G('transfer.view', <TransfersPage />)} />
        <Route path="transfers/new" element={G('transfer.create', <NewTransferPage />)} />
        <Route path="transfers/:id" element={G('transfer.view', <TransferDetailPage />)} />
        <Route path="expenses" element={G('expense.view', <ExpensesPage />)} />
        <Route path="reports" element={G('report.view', <ReportsPage />)} />
        <Route path="settings" element={G('settings.manage', <SettingsPage />)} />
        <Route path="users" element={G('users.manage', <UsersPage />)} />
        <Route path="audit" element={G('audit.view', <AuditPage />)} />
        <Route path="backup" element={G('backup.manage', <BackupPage />)} />
        <Route path="change-password" element={<ChangePasswordPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
