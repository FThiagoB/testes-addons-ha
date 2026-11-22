import React, { useEffect, useState } from 'react';
import { X, Save, UserCog } from 'lucide-react';

export default function EditUserModal({ user, onClose, onSave }) {
  const [name, setName] = useState('');
  const [registration, setRegistration] = useState('');

  // '0' = Usuário padrão (null), '1' = Visitante (1)
  // https://www.controlid.com.br/docs/access-api-pt/objetos/lista-de-objetos/

  const [userType, setUserType] = useState('0'); 
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setRegistration(user.registration || '');
      setUserType(user.user_type_id === 1 ? '1' : '0');
    }
  }, [user]);

  if (!user) return null;

  const initialName = user.name || '';
  const initialReg = user.registration || '';
  const initialType = user.user_type_id === 1 ? '1' : '0';

  // modificação em qualquer campo
  const hasChanges =
    name.trim() !== initialName.trim() ||
    registration.trim() !== initialReg.trim() ||
    userType !== initialType;

  const isFormValid = name.trim().length > 0;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!hasChanges || !isFormValid || saving) return;

    setSaving(true);
    const success = await onSave(user.id, {
      name: name.trim(),
      registration: registration.trim(),
      user_type_id: userType === '1' ? 1 : null,
    });
    setSaving(false);

    if (success) {
      onClose();
    }
  }

  // TODO: Adicionar os outros campos e permitir a modificação do campo de ID 
  // TODO: Verificar a obtenção do cartão e da formatação em duas vias do Wiegand
  // TODO: Pesquisar formas de upar imagens e verificar a compatibilidade com o HAOS
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <UserCog className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Editar Usuário
              </h3>
              <p className="text-xs text-slate-500">ID: {user.id}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Nome completo
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Maria Oliveira"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Matrícula
            </label>
            <input
              type="text"
              placeholder="Ex: MAT-2026-10"
              value={registration}
              onChange={(e) => setRegistration(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Tipo de usuário
            </label>
            <select
              value={userType}
              onChange={(e) => setUserType(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            >
              <option value="0">Usuário (Padrão)</option>
              <option value="1">Visitante</option>
            </select>
          </div>

          {/* Rodapé com Salvar e Cancelar */}
          <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={!hasChanges || !isFormValid || saving}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-xs transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}