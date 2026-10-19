import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useMediaQuery } from './hooks/useMediaQuery';

import { SplashScreen, LoaderProvider, useLoader } from './components/brand';
import { initMotionDebug } from './components/brand/motionDebug';
import { useEffect, useState } from 'react';

initMotionDebug();
import Layout from './components/layout/Layout';

// ─── Lazy page imports ────────────────────────────────────────────────────────
const Login    = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));

// Plots
const AddPlot        = lazy(() => import('./pages/plots/AddPlot'));
const PlotList       = lazy(() => import('./pages/plots/PlotList'));
const PlotDetail     = lazy(() => import('./pages/plots/PlotDetail'));
const PlotCategories = lazy(() => import('./pages/plots/PlotCategories'));
const PlotMap        = lazy(() => import('./pages/plots/PlotMap'));

// Customers
const AddCustomer    = lazy(() => import('./pages/customers/AddCustomer'));
const CustomerList   = lazy(() => import('./pages/customers/CustomerList'));
const CustomerDetail = lazy(() => import('./pages/customers/CustomerDetail'));

// Bookings
const BookingList = lazy(() => import('./pages/bookings/BookingList'));

// Sales
const NewSale          = lazy(() => import('./pages/sales/NewSale'));
const SalesList        = lazy(() => import('./pages/sales/SalesList'));

// Payments
const PaymentPlans    = lazy(() => import('./pages/payments/PaymentPlans'));
const ReceivePaymentHub = lazy(() => import('./pages/payments/ReceivePaymentHub'));
const ReceivePayment  = lazy(() => import('./pages/payments/ReceivePayment'));
const PaymentHistory  = lazy(() => import('./pages/payments/PaymentHistory'));
const DownPayments    = lazy(() => import('./pages/payments/DownPayments'));
const DownPaymentLedger = lazy(() => import('./pages/payments/DownPaymentLedger'));
const ReceiveDownPayment = lazy(() => import('./pages/payments/ReceiveDownPayment'));

// Dealers
const AddDealer       = lazy(() => import('./pages/dealers/AddDealer'));
const DealerList      = lazy(() => import('./pages/dealers/DealerList'));
const DealerCommission = lazy(() => import('./pages/dealers/DealerCommission'));



// Reports
const ReportsHub             = lazy(() => import('./pages/reports/ReportsHub'));
const DailyReport            = lazy(() => import('./pages/reports/DailyReport'));
const SaleReport             = lazy(() => import('./pages/reports/SaleReport'));
const BookingReport          = lazy(() => import('./pages/reports/BookingReport'));
const InstallmentReport      = lazy(() => import('./pages/reports/InstallmentReport'));
const CollectionReport       = lazy(() => import('./pages/reports/CollectionReport'));
const PendingPaymentsReport  = lazy(() => import('./pages/reports/PendingPaymentsReport'));
const CustomerLedger         = lazy(() => import('./pages/reports/CustomerLedger'));
const DealerCommissionReport = lazy(() => import('./pages/reports/DealerCommissionReport'));
const PlotStatusReport       = lazy(() => import('./pages/reports/PlotStatusReport'));
const ShortageList           = lazy(() => import('./pages/reports/ShortageList'));
const TermsAndConditions     = lazy(() => import('./pages/reports/TermsAndConditions'));

// Settings
const CompanyInfo     = lazy(() => import('./pages/settings/CompanyInfo'));
const UsersManagement = lazy(() => import('./pages/settings/UsersManagement'));
const BackupData      = lazy(() => import('./pages/settings/BackupData'));

import { PageLoading } from './components/brand';

const PageSuspense: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<PageLoading />}>
    {children}
  </Suspense>
);

// ─── Redirect Helpers ─────────────────────────────────────────────────────────
const AgreementRedirect: React.FC = () => {
  const [searchParams] = useSearchParams();
  const saleId = searchParams.get('saleId');
  return <Navigate to={saleId ? `/sales/list?saleId=${saleId}` : '/sales/list'} replace />;
};

// ─── Protected Route ──────────────────────────────────────────────────────────
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, loading } = useAuth();
  const [searchParams] = useSearchParams();
  if (searchParams.get('demo') === '1' || searchParams.get('demo3d') === '1') return <>{children}</>;
  if (loading) return null;
  if (!currentUser) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

// ─── App Inner ────────────────────────────────────────────────────────────────
const AppInner: React.FC = () => {
  const { loading, currentUser } = useAuth();
  const isDemo =
    typeof window !== 'undefined' &&
    (window.location.search.includes('demo=1') || window.location.search.includes('demo3d=1'));
  const [splashDone, setSplashDone] = useState(isDemo);
  const [appMounted, setAppMounted] = useState(isDemo);

  // appMounted state starts as false. The splash screen sets it to true when the intro finishes.
  return (
    <>
      {!splashDone && (
        <SplashScreen 
          ready={!loading} 
          appMounted={appMounted}
          setAppMounted={setAppMounted}
          onDone={() => setSplashDone(true)} 
        />
      )}
      {appMounted && (
        <div id="app-shell" style={{ opacity: isDemo ? 1 : 0 }}>
          <PageSuspense>
            <Routes>
        {/* Public routes */}
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected layout routes */}
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />

          {/* Plots */}
          <Route path="plots/add"           element={<AddPlot />} />
          <Route path="plots/list"          element={<PlotList />} />
          <Route path="plots/edit/:id"      element={<AddPlot />} />
          <Route path="plots/categories"    element={<PlotCategories />} />
          <Route path="plots/map"           element={<PlotMap />} />
          <Route path="plots/:id"           element={<PlotDetail />} />

          {/* Customers */}
          <Route path="customers/add"       element={<AddCustomer />} />
          <Route path="customers/list"      element={<CustomerList />} />
          <Route path="customers/edit/:id"  element={<AddCustomer />} />
          <Route path="customers/:id"       element={<CustomerDetail />} />

          {/* Bookings */}
          <Route path="bookings/new"        element={<Navigate to="/sales/new?mode=booking" replace />} />
          <Route path="bookings/list"       element={<BookingList />} />

          {/* Sales */}
          <Route path="sales/new"           element={<NewSale />} />
          <Route path="sales/list"          element={<SalesList />} />
          <Route path="sales/agreement"     element={<AgreementRedirect />} />

          {/* Payments */}
          <Route path="payment-plans/new"         element={<PaymentPlans />} />
          <Route path="payment-plans/list"         element={<PaymentPlans />} />
          <Route path="payments/receive"           element={<ReceivePaymentHub />} />
          <Route path="payments/possession"        element={<Navigate to="/payments/receive?type=possession" replace />} />
          <Route path="payments/history"           element={<PaymentHistory />} />
          <Route path="payments/down-payments"     element={<DownPayments />} />
          <Route path="payments/down-payment-ledger" element={<DownPaymentLedger />} />
          <Route path="payments/receive-down-payment" element={<ReceiveDownPayment />} />

          {/* Dealers */}
          <Route path="dealers/add"         element={<AddDealer />} />
          <Route path="dealers/list"        element={<DealerList />} />
          <Route path="dealers/edit/:id"    element={<AddDealer />} />
          <Route path="dealers/commission"  element={<DealerCommission />} />
          <Route path="dealers/report"      element={<Navigate to="/reports/dealer-commission" replace />} />



          {/* Reports */}
          <Route path="reports"                    element={<ReportsHub />} />
          <Route path="reports/daily"              element={<DailyReport />} />
          <Route path="reports/sales"              element={<SaleReport />} />
          <Route path="reports/bookings"           element={<BookingReport />} />
          <Route path="reports/installments"       element={<InstallmentReport />} />
          <Route path="reports/collection"         element={<CollectionReport />} />
          <Route path="reports/pending"            element={<PendingPaymentsReport />} />
          <Route path="reports/pending/customer/:customerId" element={<CustomerLedger />} />
          <Route path="reports/dealer-commission"  element={<DealerCommissionReport />} />
          <Route path="reports/plot-status"        element={<PlotStatusReport />} />
          <Route path="reports/shortage-list"      element={<ShortageList />} />

          {/* Settings */}
          <Route path="settings/company"   element={<CompanyInfo />} />
          <Route path="settings/users"     element={<UsersManagement />} />
          <Route path="settings/backup"    element={<BackupData />} />
          <Route path="settings/terms"     element={<TermsAndConditions />} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
        </PageSuspense>
        </div>
      )}
    </>
  );
};

// ─── Responsive Toaster ───────────────────────────────────────────────────────
const ResponsiveToaster: React.FC = () => {
  const isSm = useMediaQuery('(min-width: 640px)');
  return (
    <Toaster
      position={isSm ? 'top-right' : 'top-center'}
      containerStyle={{
        top: 'calc(0.75rem + var(--safe-top))',
        maxWidth: 'calc(100vw - 2rem)',
      }}
      toastOptions={{
        duration: 3500,
        style: {
          borderRadius: '12px',
          fontSize: '13px',
          fontFamily: 'Inter, sans-serif',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          maxWidth: 'calc(100vw - 2rem)',
        },
        success: {
          style: { borderLeft: '4px solid #22c55e' },
          iconTheme: { primary: '#22c55e', secondary: '#fff' },
        },
        error: {
          style: { borderLeft: '4px solid #ef4444' },
          iconTheme: { primary: '#ef4444', secondary: '#fff' },
        },
      }}
    />
  );
};

// ─── Root ─────────────────────────────────────────────────────────────────────
const App: React.FC = () => (
  <BrowserRouter>
    <AuthProvider>
      <LoaderProvider>
        <ResponsiveToaster />
        <AppInner />
      </LoaderProvider>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
