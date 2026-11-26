import { toast } from "sonner";
import UserFormModal from "./UserFormModal";
import { syncUserPhoto } from "./uploadUserPhoto";

export default function EditUserModal({ user, onClose, onSave }) {
  async function handleEdit({ formData, photoState }) {
    if (photoState.hasPhotoChanged) {
      try {
        await syncUserPhoto({
          userId: formData.id,
          photoBase64: photoState.photoBase64,
          photoTimestamp: photoState.photoTimestamp,
        });
      } catch (err) {
        toast.error(err.message);
        return; // Mantém aberto na edição se a nova foto for rejeitada
      }
    }

    const success = await onSave(user.id, formData);
    if (success) {
      onClose();
    }
  }

  return (
    <UserFormModal
      show={Boolean(user)}
      mode="edit"
      initialUser={user}
      onClose={onClose}
      onSubmitForm={handleEdit}
    />
  );
}