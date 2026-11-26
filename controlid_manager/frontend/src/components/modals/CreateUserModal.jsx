import { toast } from "sonner";
import UserFormModal from "./UserFormModal";
import { syncUserPhoto } from "./uploadUserPhoto";

import { useControlId } from '../../context/ControlIdContext';


export default function CreateUserModal({ show, onClose, onSave }) {
  const {fetchUsers} = useControlId()
  
  async function handleCreate({ formData, photoState }) {
    const success = await onSave({
      id: formData.id,
      name: formData.name,
      pin: formData.pin === "" ? undefined : formData.pin,
      card: formData.card ?? undefined,
      admin: formData.admin,
    });

    if (!success) return;

    if (photoState.hasPhotoChanged && photoState.photoBase64) {
      try {
        await syncUserPhoto({
          userId: formData.id,
          photoBase64: photoState.photoBase64,
          photoTimestamp: photoState.photoTimestamp,
        });

        fetchUsers();
      } catch (err) {
        toast.warning(`Usuário criado, mas houve erro na foto: ${err.message}`);
      }
    }

    onClose();
  }

  return (
    <UserFormModal
      show={show}
      mode="create"
      onClose={onClose}
      onSubmitForm={handleCreate}
    />
  );
}