import { Suspense } from "react";
import Dashboard from "./dashboard";
import { redirect } from "next/navigation";
import { getAdmin } from "./lib/admin-session";

async function ProtectedDashboard() {
  if (!await getAdmin()) redirect('/login');
  return <Dashboard />;
}

export default function Home() {
  return (
    <Suspense fallback={<div className="dashboard-loading">Cargando panel...</div>}>
      <ProtectedDashboard />
    </Suspense>
  );
}
