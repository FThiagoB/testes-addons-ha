import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { toast } from "sonner";

const ControlIdContext = createContext(null);

export function ControlIdProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState({ device_ip: "", use_mock: true });
  const [loading, setLoading] = useState(true);

  // { type: 'auth' | 'network', message: string } | null
  const [error, setError] = useState(null);

  const fetchUsers = useCallback(async (showToastOnSuccess = false) => {
    setLoading(true);
    setError(null);

    try {
      const [statusRes, usersRes] = await Promise.all([
        fetch("api/device/status"),
        fetch("api/users"),
      ]);

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setStatus(statusData);
      }

      if (!usersRes.ok) {
        const errBody = await usersRes.json().catch(() => ({}));
        const isAuthError =
          usersRes.status === 401 || errBody.code === "AUTH_ERROR";
        const message =
          errBody.error ||
          (isAuthError
            ? "Falha na autenticação com o equipamento Control iD."
            : "Erro ao carregar a lista de usuários.");

        setError({
          type: isAuthError ? "auth" : "network",
          message,
        });
        toast.error(message);
        setUsers([]);
        return;
      }

      const usersData = await usersRes.json();
      setUsers(usersData);

      if (showToastOnSuccess) {
        toast.success("Lista de usuários atualizada.");
      }
    } catch {
      const msg = "Não foi possível comunicar com o backend do Add-on.";
      setError({ type: "network", message: msg });
      toast.error(msg);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers(false);
  }, [fetchUsers]);

  const createUser = useCallback(
    async (payload) => {
      try {
        const res = await fetch("api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Erro ao criar o usuário.");
        }

        toast.success("Usuário criado com sucesso!");
        await fetchUsers(false);
        return true;
      } catch (err) {
        toast.error(err.message);
        return false;
      }
    },
    [fetchUsers]
  );

  const updateUser = useCallback(
    async (id, payload) => {
      try {
        const res = await fetch(`api/users/${encodeURIComponent(id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Erro ao atualizar o usuário.");
        }

        toast.success("Usuário atualizado com sucesso!");
        await fetchUsers(false);
        return true;
      } catch (err) {
        toast.error(err.message);
        return false;
      }
    },
    [fetchUsers]
  );

  const deleteUser = useCallback(
    async (id) => {
      try {
        const res = await fetch(`api/users/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Erro ao excluir o usuário.");
        }

        toast.success("Usuário excluído com sucesso.");
        await fetchUsers(false);
        return true;
      } catch (err) {
        toast.error(err.message);
        return false;
      }
    },
    [fetchUsers]
  );

  // --- Imagens do Usuário ---
  const getUserImage = useCallback(async (id) => {
    const res = await fetch(`api/users/${encodeURIComponent(id)}/image`, {cache: "no-store"});
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.image) {
      return { image: null, timestamp: 0 };
    }
    return {
      image: data.image,
      timestamp: data.timestamp || Math.floor(Date.now() / 1000),
    };
  }, []);

  const setUserImage = useCallback(async (id, { image, timestamp }) => {
    // Se image for null/vazio, usa a rota semântica DELETE
    if (!image) {
      const delRes = await fetch(`api/users/${encodeURIComponent(id)}/image`, {
        method: "DELETE",
      });
      const delData = await delRes.json().catch(() => ({}));
      if (!delRes.ok || delData.success === false) {
        throw new Error(delData.error || "Erro ao remover a foto do usuário.");
      }
      return delData;
    }

    const rawBase64 = image.replace(
      /^data:image\/[a-zA-Z0-9+.-]+;base64,/,
      ""
    );

    const res = await fetch(`api/users/${encodeURIComponent(id)}/image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: rawBase64,
        timestamp,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      const firstErr = data.errors?.[0];
      const errMsg =
        firstErr?.friendlyMessage ||
        firstErr?.message ||
        data.error ||
        "A foto não passou na validação biométrica do equipamento.";
      throw new Error(errMsg);
    }

    return data;
  }, []);

  // --- Hardware (Control iD) ---
  const captureDeviceScreenshot = useCallback(async () => {
    const res = await fetch("api/device/screenshot");
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.image) {
      throw new Error(
        data.error || "Não foi possível capturar imagem da câmera."
      );
    }
    return data;
  }, []);

  const enrollCardFromDevice = useCallback(async (signal) => {
    const res = await fetch("api/device/enroll/card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Falha ou tempo esgotado ao ler o cartão.");
    }

    return data.card;
  }, []);

  const cancelEnrollCardFromDevice = useCallback(async () => {
    await fetch("api/device/enroll/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch(() => {});
  }, []);

  return (
    <ControlIdContext.Provider
      value={{
        users,
        status,
        loading,
        error,
        fetchUsers,
        createUser,
        updateUser,
        deleteUser,
        getUserImage,
        setUserImage,
        captureDeviceScreenshot,
        enrollCardFromDevice,
        cancelEnrollCardFromDevice,
      }}
    >
      {children}
    </ControlIdContext.Provider>
  );
}

export function useControlId() {
  const context = useContext(ControlIdContext);
  if (!context) {
    throw new Error("useControlId deve ser usado dentro de ControlIdProvider");
  }
  return context;
}