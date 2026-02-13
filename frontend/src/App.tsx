import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import './App.css'
import Home from './pages/Home'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Pricing from './pages/Pricing'
import Dashboard from './pages/Dashboard'
import GoogleCallback from './pages/GoogleCallback'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Contact from './pages/Contact'
import Careers from './pages/Careers'
import PentestRunner from './pages/PentestRunner'

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/careers" element={<Careers />} />
            <Route path="/auth/google/callback" element={<GoogleCallback />} />
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
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  )
}

export default App
