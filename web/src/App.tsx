import { Navigate, Route, Routes } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RunListPage from './pages/RunListPage';
import RunPage from './pages/RunPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RunListPage />} />
      <Route path="/runs/:runId" element={<RunPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
