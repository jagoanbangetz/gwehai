import { useEffect, Suspense, lazy } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import NavLoadingBar from './components/NavLoadingBar'
import './App.css'

// Lazy load semua halaman — cuma load yang dibuka user
const Home = lazy(() => import('./pages/Home'))
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const VerifySignup = lazy(() => import('./pages/VerifySignup'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Pricing = lazy(() => import('./pages/Pricing'))
const Methodology = lazy(() => import('./pages/Methodology'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const GoogleCallback = lazy(() => import('./pages/GoogleCallback'))
const Terms = lazy(() => import('./pages/Terms'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Contact = lazy(() => import('./pages/Contact'))
const PentestRunner = lazy(() => import('./pages/PentestRunner'))
const PentestStream = lazy(() => import('./pages/PentestStream'))
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview'))
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'))
const AdminConversations = lazy(() => import('./pages/admin/AdminConversations'))
const AdminHacktivity = lazy(() => import('./pages/admin/AdminHacktivity'))
const AdminReports = lazy(() => import('./pages/admin/AdminReports'))
const AdminUsage = lazy(() => import('./pages/admin/AdminUsage'))
const AdminCostCenter = lazy(() => import('./pages/admin/AdminCostCenter'))
const AdminAbuseCenter = lazy(() => import('./pages/admin/AdminAbuseCenter'))
const AdminOpsConsole = lazy(() => import('./pages/admin/AdminOpsConsole'))
const AdminGuardrails = lazy(() => import('./pages/admin/AdminGuardrails'))
const AdminMargin = lazy(() => import('./pages/admin/AdminMargin'))
const AdminSystem = lazy(() => import('./pages/admin/AdminSystem'))
const AdminAudit = lazy(() => import('./pages/admin/AdminAudit'))
const AdminPromotion = lazy(() => import('./pages/admin/AdminPromotion'))
const AdminBilling = lazy(() => import('./pages/admin/AdminBilling'))
const AdminPaymentSubscriptions = lazy(() => import('./pages/admin/AdminPaymentSubscriptions'))
const AdminPaymentPlans = lazy(() => import('./pages/admin/AdminPaymentPlans'))
const AdminModels = lazy(() => import('./pages/admin/AdminModels'))
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'))
const AdminContact = lazy(() => import('./pages/admin/AdminContact'))
const Forbidden = lazy(() => import('./pages/Forbidden'))

function LazyFallback() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#0f1117', color: '#94a3b8',
      fontSize: '0.9rem', fontFamily: 'system-ui, sans-serif',
    }}>
      Loading…
    </div>
  )
}

function ScrollToHash() {
  const location = useLocation()
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.slice(1)
      const el = document.getElementById(id)
      if (el) {
        const t = setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 100)
        return () => clearTimeout(t)
      }
    }
  }, [location.pathname, location.hash])
  return null
}

function NotFoundRedirect() {
  const { isAuthenticated, authReady } = useAuth()
  if (!authReady) return null
  return <Navigate to={isAuthenticated ? '/agent' : '/'} replace />
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <NavLoadingBar />
          <ScrollToHash />
          <Suspense fallback={<LazyFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/verify-signup" element={<VerifySignup />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/methodology" element={<Methodology />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/auth/google/callback" element={<GoogleCallback />} />
              <Route path="/forbidden" element={<Forbidden />} />
              <Route
                path="/admin"
                element={
                  <AdminRoute>
                    <AdminLayout />
                  </AdminRoute>
                }
              >
                <Route index element={<Navigate to="/admin/overview" replace />} />
                <Route path="overview" element={<AdminOverview />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="conversations" element={<AdminConversations />} />
                <Route path="jobs" element={<Navigate to="/admin/ops-console" replace />} />
                <Route path="hacktivity" element={<AdminHacktivity />} />
                <Route path="reports" element={<AdminReports />} />
                <Route path="usage" element={<AdminUsage />} />
                <Route path="billing" element={<AdminBilling />} />
                <Route path="payment/subscriptions" element={<AdminPaymentSubscriptions />} />
                <Route path="payment/plans" element={<AdminPaymentPlans />} />
                <Route path="cost-center" element={<AdminCostCenter />} />
                <Route path="abuse-center" element={<AdminAbuseCenter />} />
                <Route path="ops-console" element={<AdminOpsConsole />} />
                <Route path="guardrails" element={<AdminGuardrails />} />
                <Route path="margin" element={<AdminMargin />} />
                <Route path="system" element={<AdminSystem />} />
                <Route path="audit" element={<AdminAudit />} />
                <Route path="models" element={<AdminModels />} />
                <Route path="settings" element={<AdminSettings />} />
                <Route path="contact" element={<AdminContact />} />
                <Route path="promotion" element={<AdminPromotion />} />
              </Route>
              <Route
                path="/agent"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/agent/pentest-runner"
                element={
                  <ProtectedRoute>
                    <PentestRunner />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/agent/pentest-stream"
                element={
                  <ProtectedRoute>
                    <PentestStream />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<NotFoundRedirect />} />
            </Routes>
          </Suspense>
        </div>
      </Router>
    </AuthProvider>
  )
}

export default App
