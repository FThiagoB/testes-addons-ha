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
        fetch("api/status"),
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

  const updateUser = async (id, payload) => {
    try {
      const res = await fetch(`api/users/${id}`, {
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
  };

  const createUser = async (payload) => {
    try {
      console.log("Dentro de createUser(), fazendo o fetch ");

      const res = await fetch(`api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log("Fetch retornou");

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
  };

  const deleteUser = async (id) => {
    try {
      const res = await fetch(`api/users/${id}`, {
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
  };

  return (
    <ControlIdContext.Provider
      value={{
        users,
        status,
        loading,
        error,
        fetchUsers,
        updateUser,
        deleteUser,
        createUser,
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
