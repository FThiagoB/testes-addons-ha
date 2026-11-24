import React, { useEffect, useState, useRef } from 'react';
import { X, Save, UserCog, User, Hash, KeyRound, CreditCard, BadgeCheck, Shield, Users, Upload, Camera, Trash2, ArrowLeftRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function EditUserModal({ user, onClose, onSave }) {
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [card, setCard] = useState('');
  const [isWiegandView, setIsWiegandView] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [photoBase64, setPhotoBase64] = useState(null);
  const [photoTimestamp, setPhotoTimestamp] = useState(0);
  const [initialPhotoState, setInitialPhotoState] = useState({ base64: null, timestamp: 0 });
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [capturingFromDevice, setCapturingFromDevice] = useState(false);
  const [showMobilePhotoActions, setShowMobilePhotoActions] = useState(false);

  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  function intToWiegand( cardNumber ){
    if (!cardNumber || cardNumber === "") return "";

    // Computa os números do fabricante e do cartão (wiegand)
    let FC = BigInt( cardNumber ) >> 32n;
    let CC = BigInt( cardNumber ) & BigInt(0xFFFFFFFF);

    return String(FC).padStart(3, '0') + "." + String(CC).padStart(5, '0')
  }

  function normalizeBase64Image(base64) {
    if (!base64) return null;
    if (base64.startsWith('data:image/')) return base64;
    return `data:image/jpeg;base64,${base64}`;
  }

  useEffect(() => {
    if (!user) return;

    setUserId(String(user.id ?? ''));
    setName(user.name || '');
    setPin(user.pin || '');
    setCard(user.card ? String(user.card) : '');
    setIsWiegandView(false);
    setIsAdmin(Boolean(user.admin));
    setShowMobilePhotoActions(false);

    let active = true;

    // Basear com base na rota local
    async function loadUserImage() {
      setLoadingPhoto(true);
      try {
        const res = await fetch(`api/user_get_image?user_id=${encodeURIComponent(user.id)}`);
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.image) {
          setPhotoBase64(null);
          setPhotoTimestamp(0);
          setInitialPhotoState({ base64: null, timestamp: 0 });
        } else {
          const normalized = normalizeBase64Image(data.image);
          const ts = data.timestamp || Math.floor(Date.now() / 1000);
          setPhotoBase64(normalized);
          setPhotoTimestamp(ts);
          setInitialPhotoState({ base64: normalized, timestamp: ts });
        } 
      }
      catch {
        if (!active) return;
        setPhotoBase64(null);
        setPhotoTimestamp(0);
        setInitialPhotoState({ base64: null, timestamp: 0 });
      }
      finally {
        if (active) setLoadingPhoto(false);
      }
    }

    loadUserImage();
    return () => {
      active = false;
    };
  }, [user]);

  if (!user) return null;

  const initialId = String(user.id ?? '');
  const initialName = user.name || '';
  const initialPin = user.pin || '';
  const initialCard = user.card ? String(user.card) : '';
  const initialAdmin = Boolean(user.admin);
  const initialType = user.user_type_id === 1 ? '1' : '0';

  const hasPhotoChanged = photoBase64 !== initialPhotoState.base64 || photoTimestamp !== initialPhotoState.timestamp;
  const hasChanges = userId.trim() !== initialId.trim() || name.trim() !== initialName.trim() || pin.trim() !== initialPin.trim() || card.trim() !== initialCard.trim() || isAdmin !== initialAdmin ||  hasPhotoChanged;
  const isFormValid = name.trim().length > 0 && Number(userId) > 0;

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Selecione um arquivo de imagem válido (JPG, PNG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPhotoBase64(reader.result);
      setPhotoTimestamp(Math.floor(Date.now() / 1000));
      setShowMobilePhotoActions(false);
      toast.info('Nova foto carregada. Clique em Salvar para aplicar.');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleCaptureFromControlId() {
    setCapturingFromDevice(true);
    setShowMobilePhotoActions(false);
    try {
      const res = await fetch('api/get_screenshot');
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.image) {
        throw new Error(data.error || 'Não foi possível capturar imagem da câmera.');
      }

      const normalized = normalizeBase64Image(data.image);
      setPhotoBase64(normalized);
      setPhotoTimestamp(data.timestamp || Math.floor(Date.now() / 1000));
      toast.info('Clique em Salvar para cadastrar no usuário.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCapturingFromDevice(false);
    }
  }

  function handleRemovePhoto() {
    setPhotoBase64(null);
    setPhotoTimestamp(0);
    setShowMobilePhotoActions(false);
    toast.info('Clique em Salvar para confirmar.');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!hasChanges || !isFormValid || saving) return;

    setSaving(true);

    if (hasPhotoChanged) {
      try {
        const rawBase64 = photoBase64
          ? photoBase64.replace(/^data:image\/\w+;base64,/, '')
          : null;

        const imgRes = await fetch('api/set_userimage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: Number(userId),
            image: rawBase64,
            timestamp: photoTimestamp,
          }),
        });

        const imgData = await imgRes.json().catch(() => ({}));

        if (!imgRes.ok || imgData.success === false) {
          const firstErr = imgData.errors?.[0];
          const errMsg =
            firstErr?.friendlyMessage ||
            firstErr?.message ||
            imgData.error ||
            'A foto não passou na validação biométrica do equipamento.';
          throw new Error(errMsg);
        }
      } catch (err) {
        toast.error(err.message);
        setSaving(false);
        return;
      }
    }

    // 2. Salva os dados cadastrais do usuário
    const success = await onSave(user.id, {
      id: Number(userId),
      name: name.trim(),
      pin: pin.trim(),
      card: card.trim() ? Number(card.trim()) : null,
      admin: isAdmin,
    });

    setSaving(false);
    if (success) {
      onClose();
    }
  }

  const formattedWiegand = intToWiegand(card);

  // TODO: Adicionar os outros campos e permitir a modificação do campo de ID 
  // TODO: Verificar a obtenção do cartão e da formatação em duas vias do Wiegand
  // TODO: Pesquisar formas de upar imagens e verificar a compatibilidade com o HAOS
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Editar Usuário
              </h3>
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

        <form onSubmit={handleSubmit} className="overflow-y-auto px-5 py-5 sm:px-6">
          <div className="mb-6 flex flex-col items-center">
            <div
              onClick={() => setShowMobilePhotoActions((prev) => !prev)}
              className="group relative h-48 w-48 cursor-pointer overflow-hidden rounded-full border-2 border-slate-200 bg-slate-100 shadow-xs transition hover:border-sky-400"
            >
              {loadingPhoto || capturingFromDevice ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-400">
                  <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
                  <span className="text-[10px] font-medium">
                    {capturingFromDevice ? 'Capturando...' : 'Carregando...'}
                  </span>
                </div>
              ) : photoBase64 && photoTimestamp > 0 ? (
                <img
                  src={photoBase64}
                  alt={name || 'Foto do usuário'}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center text-slate-400">
                  <User className="h-10 w-10 stroke-[1.5]" />
                  <span className="mt-0.5 text-[10px] font-medium">Sem foto</span>
                </div>
              )}

              {/* Overlay ao passar o mouse (ou tocar no celular) */}
              {!loadingPhoto && !capturingFromDevice && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className={`absolute inset-0 flex items-center justify-center gap-1.5 bg-slate-900/70 transition-opacity duration-200 ${
                    showMobilePhotoActions
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  {/* Upload do computador / celular */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Fazer upload do computador/celular"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-slate-800 shadow-xs transition hover:bg-sky-500 hover:text-white"
                  >
                    <Upload className="h-4 w-4" />
                  </button>

                  {/* Tirar foto pelo Control iD */}
                  <button
                    type="button"
                    onClick={handleCaptureFromControlId}
                    title="Capturar foto pelo Control iD"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-slate-800 shadow-xs transition hover:bg-sky-500 hover:text-white"
                  >
                    <Camera className="h-4 w-4" />
                  </button>

                  {/* Excluir foto (se existir) */}
                  {photoBase64 && photoTimestamp > 0 && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      title="Excluir foto"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-red-600 shadow-xs transition hover:bg-red-600 hover:text-white"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                ID
              </label>
              <div className="relative">
                <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="Ex: 1001"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3.5 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Nome
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  placeholder="Ex: Maria Oliveira"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                PIN
              </label>

              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Ex: 123456"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3.5 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">
                  Cartão RFID
                </label>
              </div>

              <div className="relative">
                <CreditCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                {isWiegandView ? (
                  <input
                    type="text"
                    readOnly
                    value={formattedWiegand || 'Nenhum cartão informado'}
                    className="w-full rounded-lg border border-sky-200 bg-sky-50/50 py-2 pl-9 pr-20 text-sm font-mono text-sky-900 focus:outline-none"
                  />
                ) : (
                  <input
                    type="number"
                    placeholder="Ex: 10542891"
                    value={card}
                    onChange={(e) => setCard(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-20 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                )}
                <span className="cursor-pointer absolute right-3 top-1/2 -translate-y-1/2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500" onClick={() => setIsWiegandView((prev) => !prev)}>
                  {isWiegandView ? 'Wiegand' : 'Inteiro'}
                </span>
              </div>
            </div>

            <div className="sm:col-span-2 mx-auto">
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 transition hover:border-slate-300 hover:bg-slate-50">
                <div className="flex items-center gap-3 px-2">
                  <div>
                    <span className="block text-sm font-medium text-slate-900">
                      Administrador
                    </span>
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={isAdmin}
                  onChange={(e) => setIsAdmin(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
              </label>
            </div>
          </div>

          {/* Rodapé com Salvar (se houver modificação) e Cancelar */}
          <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
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