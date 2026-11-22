import React from 'react';
import { Toaster } from 'sonner';
import { ShieldCheck, Users, Server } from 'lucide-react';
import { ControlIdProvider, useControlId } from './context/ControlIdContext';
import UsersTab from './components/UsersTab';

function ShellLayout() {
  const { status, users } = useControlId();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Navbar Branca */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            {/* <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white shadow-xs">
              <ShieldCheck className="h-6 w-6" />
            </div> */}
            <div>
              <h1 className="text-base font-bold leading-tight text-slate-900">
                ControlID FaceID
              </h1>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                <Server className="h-3.5 w-3.5" />
                <span>{status.device_ip || 'Conectando...'}</span>
              </div>
            </div>
          </div>

          {/* Navegação */}
          <nav className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-sky-50 px-3.5 py-2 text-sm font-semibold text-sky-700 ring-1 ring-inset ring-sky-600/20"
            >
              <Users className="h-4 w-4" />
              <span>Usuários</span>
            </button>
          </nav>
        </div>
      </header>
      
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <UsersTab />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ControlIdProvider>
      <Toaster position="top-right" richColors closeButton />
      <ShellLayout />
    </ControlIdProvider>
  );
}