import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  X,
  Save,
  UserCog,
  User,
  Hash,
  KeyRound,
  CreditCard,
  BadgeCheck,
  Shield,
  Users,
  Upload,
  Camera,
  Trash2,
  ArrowLeftRight,
  Loader2,
  Nfc,
} from "lucide-react";

import { toast } from "sonner";

import { useControlId } from "../../context/ControlIdContext";

function intToWiegand(cardNumber) {
  if (!cardNumber || cardNumber === "") return "";

  // Computa os números do fabricante e do cartão (wiegand)
  let FC = BigInt(cardNumber) >> 32n;
  let CC = BigInt(cardNumber) & BigInt(0xffffffff);

  return String(FC).padStart(3, "0") + "." + String(CC).padStart(5, "0");
}

function normalizeBase64Image(base64) {
  if (!base64) return null;
  if (base64.startsWith("data:image/")) return base64;
  return `data:image/jpeg;base64,${base64}`;
}

export default function UserFormModal({
  show,
  initialUser = null,
  mode = "create",
  onClose,
  onSubmitForm,
}) {
  const isEdit = mode === "edit";

  const {
    captureDeviceScreenshot,
    enrollFaceFromDevice,
    enrollPinFromDevice,
    enrollCardFromDevice,
    cancelEnrollCardFromDevice,
    getUserImage,
  } = useControlId();

  // Estados cadastrais
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [card, setCard] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  // Estados de visualização e hardware
  const [isWiegandView, setIsWiegandView] = useState(false);
  const [capturingCard, setCapturingCard] = useState(false);
  const [capturingFromDevice, setCapturingFromDevice] = useState(false);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);

  // Estados da foto
  const [photoBase64, setPhotoBase64] = useState(null);
  const [photoTimestamp, setPhotoTimestamp] = useState(0);

  const [initialPhotoState, setInitialPhotoState] = useState({
    base64: null,
    timestamp: 0,
  });

  const fileInputRef = useRef(null);
  const cardAbortRef = useRef(null);

  // Inicialização dos campos conforme o modo
  useEffect(() => {
    if (!show) return;

    setIsWiegandView(false);
    setCapturingCard(false);

    if (!isEdit || !initialUser) {
      setUserId("");
      setName("");
      setPin("");
      setCard("");
      setIsAdmin(false);
      setPhotoBase64(null);
      setPhotoTimestamp(0);
      setInitialPhotoState({ base64: null, timestamp: 0 });
      setLoadingPhoto(false);
      return;
    }

    setUserId(String(initialUser.id ?? ""));
    setName(initialUser.name || "");
    setPin(initialUser.pin || "");
    setCard(initialUser.card ? String(initialUser.card) : "");
    setIsAdmin(Boolean(initialUser.admin));

    let active = true;

    async function loadUserImage() {
      setLoadingPhoto(true);
      try {
        // console.log(`ID usuário: ${initialUser.id} [tem imagem? ${initialUser.hasImage}]`);
        const data = await getUserImage(initialUser.id);
        // console.log(data);

        if (!active) return;

        if (!data?.image) {
          setPhotoBase64(null);
          setPhotoTimestamp(0);
          setInitialPhotoState({ base64: null, timestamp: 0 });
          return;
        }

        const normalized = normalizeBase64Image(data.image);
        const ts = data.timestamp || Math.floor(Date.now() / 1000);
        setPhotoBase64(normalized);
        setPhotoTimestamp(ts);
        setInitialPhotoState({ base64: normalized, timestamp: ts });
      } catch {
        if (!active) return;
        setPhotoBase64(null);
        setPhotoTimestamp(0);
        setInitialPhotoState({ base64: null, timestamp: 0 });
      } finally {
        if (active) setLoadingPhoto(false);
      }
    }

    loadUserImage();

    return () => {
      active = false;
    };
  }, [show, isEdit, initialUser]);

  // Cancela no hardware apenas se o modal desmontar com uma leitura em andamento
  useEffect(() => {
    return () => {
      if (cardAbortRef.current) {
        cardAbortRef.current.abort();
        cardAbortRef.current = null;
        cancelEnrollCardFromDevice();
      }
    };
  }, [cancelEnrollCardFromDevice]);

  const formattedWiegand = useMemo(() => intToWiegand(card), [card]);

  const hasPhotoChanged =
    photoBase64 !== initialPhotoState.base64 ||
    photoTimestamp !== initialPhotoState.timestamp;

  const isFormValid =
    userId.trim() !== "" &&
    !Number.isNaN(Number(userId)) &&
    name.trim().length > 0;

  const hasChanges = useMemo(() => {
    if (!isEdit) return true;
    if (!initialUser) return false;

    const initialCard = initialUser.card ? String(initialUser.card) : "";
    return (
      String(initialUser.id) !== userId.trim() ||
      (initialUser.name || "") !== name.trim() ||
      (initialUser.pin || "") !== pin.trim() ||
      initialCard !== card.trim() ||
      Boolean(initialUser.admin) !== isAdmin ||
      hasPhotoChanged
    );
  }, [isEdit, initialUser, userId, name, pin, card, isAdmin, hasPhotoChanged]);

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem válido (JPG, PNG).");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPhotoBase64(reader.result);
      setPhotoTimestamp(Math.floor(Date.now() / 1000));
      toast.info("Nova foto carregada. Clique em Salvar para aplicar.");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleCaptureFromControlId() {
    setCapturingFromDevice(true);
    try {
      // const data = await captureDeviceScreenshot();
      const data = await enrollFaceFromDevice();
      const normalized = normalizeBase64Image(data);
      console.log(`Foi retornado: ${data}`);
      console.log(`Normalized: ${normalized}`);

      setPhotoBase64(normalized);
      setPhotoTimestamp(data.timestamp || Math.floor(Date.now() / 1000));
      toast.info("Clique em Salvar.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCapturingFromDevice(false);
    }
  }

  function handleRemovePhoto() {
    setPhotoBase64(null);
    setPhotoTimestamp(0);
    toast.info("Clique em Salvar para confirmar.");
  }

  async function handleCaptureCard() {
    if (capturingCard) {
      cardAbortRef.current?.abort();
      cardAbortRef.current = null;
      setCapturingCard(false);
      toast.info("Leitura de cartão cancelada.");
      cancelEnrollCardFromDevice();
      return;
    }

    const controller = new AbortController();
    cardAbortRef.current = controller;
    setCapturingCard(true);
    toast.info("Aproxime o cartão no equipamento Control iD...");

    try {
      const cardNumber = await enrollCardFromDevice(controller.signal);
      if (controller.signal.aborted) return;
      setCard(String(cardNumber));
      toast.success("Cartão lido com sucesso!");
    } catch (err) {
      if (err.name !== "AbortError" && !controller.signal.aborted) {
        toast.error(err.message);
      }
    } finally {
      if (cardAbortRef.current === controller) {
        cardAbortRef.current = null;
        setCapturingCard(false);
      }
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!hasChanges || !isFormValid || saving) return;

    setSaving(true);
    try {
      await onSubmitForm({
        formData: {
          id: Number(userId),
          name: name.trim(),
          pin: pin.trim(),
          card: card.trim() ? Number(card.trim()) : null,
          admin: isAdmin,
        },
        photoState: {
          hasPhotoChanged,
          photoBase64,
          photoTimestamp,
        },
      });
    } finally {
      setSaving(false);
    }
  }

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-3 sm:p-4"
      onClick={onClose}
      disabled={saving}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {isEdit ? "Editar Usuário" : "Novo Usuário"}
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

        <form
          onSubmit={handleSubmit}
          className="overflow-y-auto px-5 py-5 sm:px-6"
        >
          <div className="mb-6 flex flex-col items-center gap-3.5">
            <div className="relative h-44 w-44 overflow-hidden rounded-full border-2 border-slate-200 bg-slate-100 shadow-xs">
              {loadingPhoto || capturingFromDevice ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-slate-400">
                  <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
                  <span className="text-xs font-medium">
                    {capturingFromDevice ? "Capturando..." : "Carregando..."}
                  </span>
                </div>
              ) : photoBase64 && photoTimestamp > 0 ? (
                <img
                  src={photoBase64}
                  alt={name || "Foto do usuário"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center text-slate-400">
                  <User className="h-12 w-12 stroke-[1.5]" />
                  <span className="mt-1 text-xs font-medium">Sem foto</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {/* 1. Upload Local (Abre Galeria ou Câmera no Mobile / Arquivos no PC) */}
              <button
                type="button"
                disabled={loadingPhoto || capturingFromDevice}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5 text-slate-500" />
                <span>Enviar foto</span>
              </button>

              <button
                type="button"
                disabled={loadingPhoto || capturingFromDevice}
                onClick={handleCaptureFromControlId}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 shadow-2xs transition hover:border-sky-300 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Camera className="h-3.5 w-3.5 text-sky-600" />
                <span>Control iD</span>
              </button>

              {photoBase64 && photoTimestamp > 0 && (
                <button
                  type="button"
                  disabled={loadingPhoto || capturingFromDevice}
                  onClick={handleRemovePhoto}
                  title="Remover foto atual"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 shadow-2xs transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Remover</span>
                </button>
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
                  min="0"
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

                <button
                  type="button"
                  onClick={handleCaptureCard}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition ${
                    capturingCard
                      ? "bg-amber-100 text-amber-800 hover:bg-red-100 hover:text-red-700"
                      : "bg-sky-50 text-sky-700 hover:bg-sky-100"
                  }`}
                >
                  {capturingCard ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Capturando... (Cancelar)</span>
                    </>
                  ) : (
                    <>
                      <Nfc className="h-3.5 w-3.5" />
                      <span>Ler no Control iD</span>
                    </>
                  )}
                </button>
              </div>

              <div className="relative">
                <CreditCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                {isWiegandView ? (
                  <input
                    type="text"
                    readOnly
                    value={
                      capturingCard
                        ? "Aguardando..."
                        : formattedWiegand || "---.-----"
                    }
                    className="w-full rounded-lg border border-sky-200 bg-sky-50/50 py-2 pl-9 pr-20 text-sm font-mono text-sky-900 focus:outline-none"
                  />
                ) : (
                  <input
                    type="number"
                    disabled={capturingCard}
                    placeholder={
                      capturingCard ? "Aguardando..." : "Ex: 10542891"
                    }
                    value={capturingCard ? "" : card}
                    onChange={(e) => setCard(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-20 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:bg-amber-50/40 disabled:text-amber-800"
                  />
                )}

                <span
                  onClick={() =>
                    !capturingCard && setIsWiegandView((prev) => !prev)
                  }
                  className={`absolute right-3 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase transition ${
                    capturingCard
                      ? "cursor-default bg-amber-100 text-amber-700"
                      : "cursor-pointer bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {capturingCard
                    ? "Capturando"
                    : isWiegandView
                      ? "Wiegand"
                      : "Inteiro"}
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
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
