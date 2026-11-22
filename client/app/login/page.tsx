import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAdmin } from '../lib/admin-session';
import LoginForm from './login-form';

async function Login() {
  if (await getAdmin()) redirect('/');
  return <LoginForm />;
}

export default function LoginPage() {
  return <Suspense fallback={<div className="dashboard-loading">Cargando...</div>}><Login /></Suspense>;
}
