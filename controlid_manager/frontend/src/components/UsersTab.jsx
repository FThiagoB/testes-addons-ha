import React, { useState } from 'react';
import {RefreshCw,Pencil,Trash2,Users,ShieldAlert,WifiOff,Search,ScanFace,Numbers,IdCardLanyard} from 'lucide-react';
import { useControlId } from '../context/ControlIdContext';

import EditUserModal from './EditUserModal';
import ConfirmDeleteModal from './ConfirmDeleteModal';

export default function UsersTab() {
  const { users, loading, error, fetchUsers, updateUser, deleteUser } = useControlId();

  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);

  function formatUnixTimestamp(ts) {
    if (!ts || ts === 0) return 'Nunca acessou';
    return new Date(ts * 1000).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function intToWiegand( cardNumber ){
    if (!cardNumber || cardNumber === "") return "";

    // Computa os números do fabricante e do cartão (wiegand)
    let FC = BigInt( cardNumber ) >> 32n;
    let CC = BigInt( cardNumber ) & BigInt(0xFFFFFFFF);

    return String(FC).padStart(3, '0') + "." + String(CC).padStart(5, '0')
  }

  const filteredUsers = users.filter((u) => {
    const term = searchTerm.toLowerCase();
    return (
      (u.name || '').toLowerCase().includes(term) ||
      (u.registration || '').toLowerCase().includes(term) ||
      String(u.id).includes(term)
    );
  });

  return (
    <div className="space-y-4">

      <div className="bg-white p-4 flex-row rounded-xl border border-slate-200 shadow-2xs my-0">
        <div className="flex flex-col justify-between gap-3 mb-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 text-center">
              Usuários
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 ml-auto">

            {/* Refresh */}
            <button
              type="button"
              onClick={() => fetchUsers(true)}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 active:bg-slate-100 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-sky-600' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>
        </div>

        {error && !loading && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-white px-6 py-12 text-center shadow-2xs">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
              {error.type === 'auth' ? (
                <ShieldAlert className="h-6 w-6" />
              ) : (
                <WifiOff className="h-6 w-6" />
              )}
            </div>
            <h3 className="mt-4 text-base font-semibold text-slate-900">
              {error.type === 'auth'
                ? 'Falha na autenticação com o Control iD'
                : 'Não foi possível carregar os usuários'}
            </h3>
            <p className="mt-1.5 max-w-md text-sm text-slate-600">
              {error.message}
            </p>
            <button
              type="button"
              onClick={() => fetchUsers(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
            >
              <RefreshCw className="h-4 w-4" />
              Tentar novamente
            </button>
          </div>
        )}

        {!error && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3.5">ID</th>
                    <th className="px-5 py-3.5">Nome</th>
                    <th className="px-5 py-3.5">Cartão</th>
                    <th className="px-5 py-3.5">Último Acesso</th>
                    <th className="px-5 py-3.5">Métodos de Acesso</th>
                    <th className="px-5 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 text-sm">
                  {loading &&
                    Array.from({ length: 6 }).map((_, idx) => (
                      <tr key={idx} className="animate-pulse">
                        <td className="px-5 py-4">
                          <div className="h-4 w-12 rounded bg-slate-200" />
                        </td>
                        <td className="px-5 py-4">
                          <div className="h-4 w-44 rounded bg-slate-200" />
                        </td>
                        <td className="px-5 py-4">
                          <div className="h-4 w-24 rounded bg-slate-200" />
                        </td>
                        <td className="px-5 py-4">
                          <div className="h-5 w-20 rounded-full bg-slate-200" />
                        </td>
                        <td className="px-5 py-4">
                          <div className="h-4 w-32 rounded bg-slate-200" />
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="ml-auto h-7 w-16 rounded bg-slate-200" />
                        </td>
                      </tr>
                    ))}

                  {!loading &&
                    filteredUsers.map((user) => (
                      <tr
                        key={user.id}
                        className="transition-colors hover:bg-slate-50/90"
                      >
                        <td className="px-5 py-3.5 font-mono text-xs text-slate-500">
                          {user.id}
                        </td>
                        <td className="px-5 py-3.5 font-medium text-slate-900">
                          {user.name}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs text-slate-600">
                          {intToWiegand(user.card) || '—'}
                        </td>
                        <td className="px-5 py-3.5 text-slate-600">
                          {formatUnixTimestamp(user.last_access)}
                        </td>

                        <td className="px-5 py-3.5 font-mono text-xs text-slate-600 text-center">
                          <div className="relative inline-flex items-center group gap-5">
                            { user.has_image && (
                              <ScanFace className="text-gray-500 hover:text-gray-800 cursor-pointer"/>
                            )}

                            {user.pin && (
                              <Numbers className="text-gray-500 hover:text-gray-800 cursor-pointer"/>
                            )}

                            {user.card && (
                              <IdCardLanyard id="IDCard" className="text-gray-500 hover:text-gray-800 cursor-pointer"/>
                            )}

                            {
                              (() => {
                                if( !user.has_image && !user.pin && !user.card)
                                  return "---";
                              })()
                            }

                          </div>
                        </td>

                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setEditingUser(user)}
                            title="Editar usuário"
                            className="inline-flex items-center justify-center rounded-lg p-2 text-slate-500 transition hover:bg-sky-50 hover:text-sky-600"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingUser(user)}
                            title="Excluir usuário"
                            className="ml-1 inline-flex items-center justify-center rounded-lg p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modais */}
      <EditUserModal
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onSave={updateUser}
      />

      <ConfirmDeleteModal
        user={deletingUser}
        onClose={() => setDeletingUser(null)}
        onConfirm={deleteUser}
      />
    </div>
  );
}