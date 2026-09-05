import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { PublicLayout } from '../layouts/PublicLayout'
import { CitizenLayout } from '../layouts/CitizenLayout'
import { StaffLayout } from '../layouts/StaffLayout'
import { AdminLayout } from '../layouts/AdminLayout'
import { LandingPage } from '../pages/LandingPage'
import { ProtectedRoute, RoleRoute, CitizenRoute } from '../features/auth/ProtectedRoute'

// Lazy heavy routes — shrink initial bundle for Lighthouse (was 1.3MB)
const NakesDashboard = lazy(() => import('../pages/NakesDashboard').then(m => ({ default: m.NakesDashboard })))
const NakesWargaPage = lazy(() => import('../pages/NakesWargaPage').then(m => ({ default: m.NakesWargaPage })))
const ExaminationPage = lazy(() => import('../pages/ExaminationPage').then(m => ({ default: m.ExaminationPage })))
const LoginPage = lazy(() => import('../pages/LoginPage').then(m => ({ default: m.LoginPage })))
const CitizenDashboard = lazy(() => import('../pages/CitizenDashboard').then(m => ({ default: m.CitizenDashboard })))
const CitizenRegistrationPage = lazy(() => import('../pages/CitizenRegistrationPage').then(m => ({ default: m.CitizenRegistrationPage })))
const AccountLinkingPage = lazy(() => import('../pages/AccountLinkingPage').then(m => ({ default: m.AccountLinkingPage })))
const AdminDashboard = lazy(() => import('../pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })))
const AdminManagementPage = lazy(() => import('../pages/AdminManagementPage').then(m => ({ default: m.AdminManagementPage })))
const QrToolsPage = lazy(() => import('../pages/QrToolsPage').then(m => ({ default: m.QrToolsPage })))
const CitizenQrPage = lazy(() => import('../pages/CitizenQrPage').then(m => ({ default: m.CitizenQrPage })))
const CitizenVerificationPage = lazy(() => import('../pages/CitizenVerificationPage').then(m => ({ default: m.CitizenVerificationPage })))
const NakesScanPage = lazy(() => import('../pages/NakesScanPage').then(m => ({ default: m.NakesScanPage })))
const WargaAktivasiPage = lazy(() => import('../pages/WargaAktivasiPage').then(m => ({ default: m.WargaAktivasiPage })))
const CitizenAiPage = lazy(() => import('../pages/CitizenAiPage').then(m => ({ default: m.CitizenAiPage })))
const AddCitizenPage = lazy(() => import('../pages/AddCitizenPage').then(m => ({ default: m.AddCitizenPage })))
const MyExaminationsPage = lazy(() => import('../pages/MyExaminationsPage').then(m => ({ default: m.MyExaminationsPage })))
const ExaminationDetailPage = lazy(() => import('../pages/ExaminationDetailPage').then(m => ({ default: m.ExaminationDetailPage })))
const ArticlesPage = lazy(() => import('../pages/ArticlesPage').then(m => ({ default: m.ArticlesPage })))
const ArticleDetailPage = lazy(() => import('../pages/ArticleDetailPage').then(m => ({ default: m.ArticleDetailPage })))
const HealthTeamPage = lazy(() => import('../pages/HealthTeamPage').then(m => ({ default: m.HealthTeamPage })))
const NakesProfilePage = lazy(() => import('../pages/NakesProfilePage').then(m => ({ default: m.NakesProfilePage })))
const NakesPublicProfilePage = lazy(() => import('../pages/NakesPublicProfilePage').then(m => ({ default: m.NakesPublicProfilePage })))
const StaffCitizenDetailPage = lazy(() => import('../pages/NakesCitizenPage').then(m => ({ default: m.StaffCitizenDetailPage })))
// CitizenPages: multiple named exports — lazy each
const CitizenHealthPage = lazy(() => import('../pages/CitizenPages').then(m => ({ default: m.CitizenHealthPage })))
const CitizenHistoryPage = lazy(() => import('../pages/CitizenPages').then(m => ({ default: m.CitizenHistoryPage })))
const CitizenProfilePage = lazy(() => import('../pages/CitizenPages').then(m => ({ default: m.CitizenProfilePage })))
const CitizenFamilyPage = lazy(() => import('../pages/CitizenPages').then(m => ({ default: m.CitizenFamilyPage })))
const CitizenNotificationsPage = lazy(() => import('../pages/CitizenPages').then(m => ({ default: m.CitizenNotificationsPage })))
const EmergencyPage = lazy(() => import('../pages/CitizenPages').then(m => ({ default: m.EmergencyPage })))

function Fallback() {
  return <div style={{ padding: '40px 16px', textAlign: 'center', color: '#6b8582', fontSize: 13 }}>Memuat...</div>
}

export function App() {
  return <Suspense fallback={<Fallback />}><Routes>
    <Route element={<PublicLayout />}>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/registrasi" element={<CitizenRegistrationPage />} />
      <Route path="/hubungkan-akun" element={<AccountLinkingPage />} />
      <Route path="/tentang" element={<LandingPage />} />
      <Route path="/layanan" element={<LandingPage />} />
      <Route path="/tim-kesehatan" element={<HealthTeamPage />} />
      <Route path="/tim-kesehatan/:id" element={<NakesPublicProfilePage />} />
      <Route path="/informasi-kesehatan" element={<ArticlesPage />} />
      <Route path="/artikel" element={<ArticlesPage />} />
      <Route path="/artikel/:slug" element={<ArticleDetailPage />} />
      <Route path="/panduan" element={<LandingPage />} />
      <Route path="/kontak" element={<LandingPage />} />
    </Route>
    <Route element={<ProtectedRoute />}>
      <Route element={<CitizenLayout />}>
        <Route element={<CitizenRoute />}>
          <Route path="/warga" element={<CitizenDashboard />} />
          <Route path="/warga/aktivasi" element={<WargaAktivasiPage />} />
          <Route path="/warga/qr-kesehatan" element={<CitizenQrPage />} />
          <Route path="/warga/kesehatan" element={<CitizenHealthPage />} />
          <Route path="/warga/ai-kesehatan" element={<CitizenAiPage />} />
          <Route path="/warga/riwayat" element={<CitizenHistoryPage />} />          <Route path="/warga/profil" element={<CitizenProfilePage />} />
          <Route path="/warga/keluarga" element={<CitizenFamilyPage />} />
          <Route path="/warga/notifikasi" element={<CitizenNotificationsPage />} />
          <Route path="/warga/bantuan" element={<EmergencyPage />} />
          <Route path="/warga/*" element={<CitizenDashboard />} />
        </Route>
      </Route>
      <Route element={<RoleRoute roles={['nakes', 'admin']} />}>
        <Route element={<StaffLayout />}>
          <Route path="/nakes" element={<NakesDashboard />} />
          <Route path="/nakes/warga" element={<NakesWargaPage />} />
          <Route path="/nakes/warga/baru" element={<AddCitizenPage basePath="/nakes" />} />
          <Route path="/nakes/warga/:citizenId" element={<StaffCitizenDetailPage basePath="/nakes" />} />
          <Route path="/nakes/pemeriksaan/:recordId" element={<ExaminationDetailPage />} />
          <Route path="/nakes/riwayat-saya" element={<MyExaminationsPage />} />
          <Route path="/nakes/scan" element={<NakesScanPage />} />
          <Route path="/nakes/pemeriksaan/baru" element={<ExaminationPage />} />
          <Route path="/nakes/profil" element={<NakesProfilePage />} />
          <Route path="/nakes/*" element={<NakesDashboard />} />
        </Route>
      </Route>

      <Route element={<RoleRoute roles={['admin']} />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/warga/baru" element={<AddCitizenPage basePath="/admin" />} />
          <Route path="/admin/verifikasi" element={<CitizenVerificationPage />} />
          <Route path="/admin/warga/:citizenId" element={<StaffCitizenDetailPage basePath="/admin" />} />
          <Route path="/admin/warga" element={<AdminManagementPage resource="citizens" />} />
          <Route path="/admin/kk" element={<AdminManagementPage resource="households" />} />
          <Route path="/admin/rt" element={<AdminManagementPage resource="rts" />} />
          <Route path="/admin/nakes" element={<AdminManagementPage resource="health_workers" />} />
          <Route path="/admin/admins" element={<AdminManagementPage resource="profiles" />} />
          <Route path="/admin/informasi" element={<AdminManagementPage resource="articles" />} />
          <Route path="/admin/kontak" element={<AdminManagementPage resource="emergency_contacts" />} />
          <Route path="/admin/qr" element={<QrToolsPage />} />
          <Route path="/admin/audit-log" element={<AdminManagementPage resource="audit_logs" />} />
          <Route path="/admin/*" element={<AdminDashboard />} />
        </Route>
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Suspense>
}
