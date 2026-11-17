import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth.jsx";
import Layout from "./components/Layout.jsx";
import ChangePassword from "./pages/ChangePassword.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Finance from "./pages/Finance.jsx";
import Lessons from "./pages/Lessons.jsx";
import Login from "./pages/Login.jsx";
import NotFound from "./pages/NotFound.jsx";
import Pricing from "./pages/Pricing.jsx";
import Settlement from "./pages/Settlement.jsx";
import StudentDetail from "./pages/StudentDetail.jsx";
import Students from "./pages/Students.jsx";
import Team from "./pages/Team.jsx";
import TutorDetail from "./pages/TutorDetail.jsx";
import Tutors from "./pages/Tutors.jsx";

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-10 text-center text-sm text-slate-500">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <ChangePassword />;
  return <Layout />;
}

export default function App() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route element={<Protected />}>
        <Route index element={<Dashboard />} />
        <Route path="students" element={<Students />} />
        <Route path="students/:id" element={<StudentDetail />} />
        <Route path="lessons" element={<Lessons />} />
        <Route path="finance" element={<Finance />} />
        <Route path="tutors" element={<Tutors />} />
        <Route path="tutors/:id" element={<TutorDetail />} />
        <Route path="settlement" element={<Settlement />} />
        <Route path="pricing" element={<Pricing />} />
        <Route path="team" element={<Team />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
