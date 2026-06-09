import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import NavLoadingBar from './components/NavLoadingBar'
import './App.css'
import Home from './pages/Home'
import Login from './pages/Login'
import Signup from './pages/Signup'
import VerifySignup from './pages/VerifySignup'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Pricing from './pages/Pricing'
import Methodology from './pages/Methodology'
import Dashboard from './pages/Dashboard'
import GoogleCallback from './pages/GoogleCallback'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Contact from './pages/Contact'
import PentestRunner from './pages/PentestRunner'
import AdminLayout from './pages/admin/AdminLayout'
import AdminOverview from './pages/admin/AdminOverview'
import AdminUsers from './pages/admin/AdminUsers'
import AdminConversations from './pages/admin/AdminConversations'
import AdminHacktivity from './pages/admin/AdminHacktivity'
import AdminReports from './pages/admin/AdminReports'
import AdminUsage from './pages/admin/AdminUsage'
import AdminCostCenter from './pages/admin/AdminCostCenter'
import AdminAbuseCenter from './pages/admin/AdminAbuseCenter'
import AdminOpsConsole from './pages/admin/AdminOpsConsole'
import AdminGuardrails from './pages/admin/AdminGuardrails'
import AdminMargin from './pages/admin/AdminMargin'
import AdminSystem from './pages/admin/AdminSystem'
import AdminAudit from './pages/admin/AdminAudit'
import AdminPromotion from './pages/admin/AdminPromotion'
import AdminBilling from './pages/admin/AdminBilling'
import AdminPaymentSubscriptions from './pages/admin/AdminPaymentSubscriptions'
import AdminPaymentPlans from './pages/admin/AdminPaymentPlans'
import AdminModels from './pages/admin/AdminModels'
import AdminSettings from './pages/admin/AdminSettings'
import Forbidden from './pages/Forbidden'

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
            <Route path="*" element={<NotFoundRedirect />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  )
}

export default App
