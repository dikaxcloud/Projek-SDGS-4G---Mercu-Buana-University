import { Navigate, Route, Routes } from 'react-router-dom'
import { PublicLayout } from '../layouts/PublicLayout'
import { CitizenLayout } from '../layouts/CitizenLayout'
import { StaffLayout } from '../layouts/StaffLayout'
import { AdminLayout } from '../layouts/AdminLayout'
import { NakesDashboard } from '../pages/NakesDashboard'
import { NakesWargaPage } from '../pages/NakesWargaPage'
import { ExaminationPage } from '../pages/ExaminationPage'
import { LandingPage } from '../pages/LandingPage'
import { LoginPage } from '../pages/LoginPage'
import { CitizenDashboard } from '../pages/CitizenDashboard'
import { PlaceholderPage } from '../pages/PlaceholderPage'
import { CitizenRegistrationPage } from '../pages/CitizenRegistrationPage'
import { AccountLinkingPage } from '../pages/AccountLinkingPage'
import { AdminDashboard } from '../pages/AdminDashboard'
import { AdminManagementPage } from '../pages/AdminManagementPage'
import { QrToolsPage } from '../pages/QrToolsPage'
import { CitizenQrPage } from '../pages/CitizenQrPage'
import { CitizenVerificationPage } from '../pages/CitizenVerificationPage'
import { NakesScanPage } from '../pages/NakesScanPage'
import { WargaAktivasiPage } from '../pages/WargaAktivasiPage'
import { CitizenHealthPage, CitizenHistoryPage, CitizenProfilePage, CitizenFamilyPage, CitizenNotificationsPage, EmergencyPage } from '../pages/CitizenPages'
import { CitizenAiPage } from '../pages/CitizenAiPage'
import { AddCitizenPage } from '../pages/AddCitizenPage'
import { StaffCitizenDetailPage } from '../pages/NakesCitizenPage'
import { MyExaminationsPage } from '../pages/MyExaminationsPage'
import { ExaminationDetailPage } from '../pages/ExaminationDetailPage'
import { ArticlesPage } from '../pages/ArticlesPage'
import { ArticleDetailPage } from '../pages/ArticleDetailPage'
import { HealthTeamPage } from '../pages/HealthTeamPage'
import { NakesProfilePage } from '../pages/NakesProfilePage'
import { ProtectedRoute, RoleRoute, CitizenRoute } from '../features/auth/ProtectedRoute'

export function App() {
  return <Routes>
    <Route element={<PublicLayout />}>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/registrasi" element={<CitizenRegistrationPage />} />
      <Route path="/hubungkan-akun" element={<AccountLinkingPage />} />
      <Route path="/tentang" element={<LandingPage />} />
      <Route path="/layanan" element={<LandingPage />} />
      <Route path="/tim-kesehatan" element={<HealthTeamPage />} />
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
  </Routes>
}
