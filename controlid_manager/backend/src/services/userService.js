const sharp = require('sharp');
const { getAddonConfig } = require('../config/addonConfig');
const {
  getValidSession,
  invalidateSession,
  callDeviceApi,
} = require('./controlIdClient');
const { enrichFaceErrors } = require('../constants/faceErrors');
const { DeviceApiError } = require('../errors/DeviceApiError');

async function syncUserCredentialObject({
  objectName,
  originalId,
  targetUserId,
  newValue,
}) {
  const searchIds =
    originalId === targetUserId ? [targetUserId] : [originalId, targetUserId];

  const existingRes = await callDeviceApi('load_objects.fcgi', {
    object: objectName,
    where: { [objectName]: { user_id: searchIds } },
  });

  const existingList = existingRes?.[objectName] || [];
  const hasNewValue =
    newValue !== null &&
    newValue !== undefined &&
    String(newValue).trim() !== '';

  if (!hasNewValue) {
    if (existingList.length > 0) {
      await callDeviceApi('destroy_objects.fcgi', {
        object: objectName,
        where: { [objectName]: { user_id: searchIds } },
      });
    }
    return;
  }

  if (existingList.length > 0) {
    const primaryRecord = existingList[0];

    await callDeviceApi('modify_objects.fcgi', {
      object: objectName,
      values: { value: newValue, user_id: targetUserId },
      where: { [objectName]: { id: primaryRecord.id } },
    });

    if (existingList.length > 1) {
      const extraIds = existingList.slice(1).map((item) => item.id);
      await callDeviceApi('destroy_objects.fcgi', {
        object: objectName,
        where: { [objectName]: { id: extraIds } },
      });
    }
    return;
  }

  await callDeviceApi('create_objects.fcgi', {
    object: objectName,
    values: [{ value: newValue, user_id: targetUserId }],
  });
}

async function syncUserAdminRole({ originalId, targetUserId, isAdmin }) {
  const searchIds =
    originalId === targetUserId ? [targetUserId] : [originalId, targetUserId];

  const rolesRes = await callDeviceApi('load_objects.fcgi', {
    object: 'user_roles',
    where: { user_roles: { user_id: searchIds, role: 1 } },
  });

  const existingRoles = rolesRes?.user_roles || [];

  if (!isAdmin) {
    if (existingRoles.length > 0) {
      await callDeviceApi('destroy_objects.fcgi', {
        object: 'user_roles',
        where: { user_roles: { user_id: searchIds, role: 1 } },
      });
    }
    return;
  }

  if (existingRoles.length === 0) {
    await callDeviceApi('create_objects.fcgi', {
      object: 'user_roles',
      values: [{ user_id: targetUserId, role: 1 }],
    });
  } else if (originalId !== targetUserId) {
    await callDeviceApi('modify_objects.fcgi', {
      object: 'user_roles',
      values: { user_id: targetUserId, role: 1 },
      where: { user_roles: { user_id: originalId, role: 1 } },
    });
  }
}

async function listUsers() {
  const [dataUsers, dataCards, dataPins, dataUserRoles, dataUserListImage] =
    await Promise.all([
      callDeviceApi('load_objects.fcgi', { object: 'users' }),
      callDeviceApi('load_objects.fcgi', { object: 'cards' }),
      callDeviceApi('load_objects.fcgi', { object: 'pins' }),
      callDeviceApi('load_objects.fcgi', { object: 'user_roles' }),
      callDeviceApi('user_list_images.fcgi', { object: 'user_roles' }),
    ]);

  const usersList = Array.isArray(dataUsers) ? dataUsers : dataUsers.users || [];

  dataCards.cards?.forEach((card) => {
    const idx = usersList.findIndex(({ id }) => card.user_id == id);
    if (idx !== -1) usersList[idx].card = card.value;
  });

  dataPins.pins?.forEach((pin) => {
    const idx = usersList.findIndex(({ id }) => pin.user_id == id);
    if (idx !== -1) usersList[idx].pin = pin.value;
  });

  dataUserRoles.user_roles?.forEach((userRole) => {
    const idx = usersList.findIndex(({ id }) => userRole.user_id == id);
    if (idx !== -1) usersList[idx].admin = userRole.role;
  });

  dataUserListImage.user_ids?.forEach((userId) => {
    const idx = usersList.findIndex(({ id }) => userId == id);
    if (idx !== -1) usersList[idx].has_image = true;
  });

  return usersList;
}

async function createUser({ id, name, card, pin, admin }) {
  await callDeviceApi('create_objects.fcgi', {
    object: 'users',
    values: [{ id, name: name.trim(), registration: '' }],
  });

  if (card !== undefined && card !== null && card !== '') {
    await callDeviceApi(
      'create_objects.fcgi',
      { object: 'cards', values: [{ user_id: id, value: card }] },
      '',
      false
    );
  }

  if (pin !== undefined && pin !== null && pin !== '') {
    await callDeviceApi(
      'create_objects.fcgi',
      { object: 'pins', values: [{ user_id: id, value: pin }] },
      '',
      false
    );
  }

  await callDeviceApi(
    'create_objects.fcgi',
    { object: 'user_roles', values: [{ user_id: id, role: admin ? 1 : 0 }] },
    '',
    false
  );

  await callDeviceApi(
    'create_objects.fcgi',
    { object: 'user_groups', values: [{ user_id: id, group_id: 1 }] },
    '',
    false
  );
}

async function updateUser(
  originalId,
  { id, name, registration, user_type_id, card, pin, admin }
) {
  const targetUserId = id !== undefined && id !== null ? Number(id) : originalId;

  const userValues = {
    id: targetUserId,
    name,
    user_type_id: user_type_id === 1 ? 1 : null,
  };
  if (registration !== undefined) {
    userValues.registration = registration;
  }

  const userResult = await callDeviceApi('modify_objects.fcgi', {
    object: 'users',
    values: userValues,
    where: { users: { id: originalId } },
  });

  if (card !== undefined) {
    const parsedCard =
      card !== null && String(card).trim() !== '' ? Number(card) : null;
    await syncUserCredentialObject({
      objectName: 'cards',
      originalId,
      targetUserId,
      newValue: parsedCard,
    });
  }

  if (pin !== undefined) {
    const parsedPin =
      pin !== null && String(pin).trim() !== '' ? String(pin).trim() : null;
    await syncUserCredentialObject({
      objectName: 'pins',
      originalId,
      targetUserId,
      newValue: parsedPin,
    });
  }

  if (admin !== undefined) {
    await syncUserAdminRole({
      originalId,
      targetUserId,
      isAdmin: Boolean(admin),
    });
  }

  return userResult;
}

async function deleteUser(userId) {
  await Promise.allSettled([
    callDeviceApi('destroy_objects.fcgi', {
      object: 'cards',
      where: { cards: { user_id: userId } },
    }),
    callDeviceApi('destroy_objects.fcgi', {
      object: 'pins',
      where: { pins: { user_id: userId } },
    }),
    callDeviceApi('destroy_objects.fcgi', {
      object: 'user_roles',
      where: { user_roles: { user_id: userId } },
    }),
    callDeviceApi('user_destroy_image.fcgi', { user_id: userId }),
  ]);

  return callDeviceApi('destroy_objects.fcgi', {
    object: 'users',
    where: { users: { id: userId } },
  });
}

async function getUserImage(userId) {
  const config = getAddonConfig();
  const session = await getValidSession(config);
  const url = `http://${config.device_ip}/user_get_image.fcgi?session=${encodeURIComponent(
    session
  )}&user_id=${userId}&get_timestamp=1`;

  const response = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(6000),
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 400) {
    return {
      notFound: true,
      error: data.error || 'User does not have an image',
      code: data.code ?? 1,
    };
  }

  if (!response.ok) {
    if (response.status === 401) invalidateSession();
    throw new DeviceApiError(
      `Erro HTTP ${response.status} ao buscar imagem do usuário.`,
      response.status,
      'DEVICE_HTTP_ERROR'
    );
  }

  return {
    timestamp: Number(data.timestamp) || 0,
    image: data.image || '',
  };
}

async function deleteUserImage(userId) {
  await callDeviceApi('user_destroy_image.fcgi', { user_id: userId });
  return { user_id: userId, success: true, errors: [], timestamp: 0 };
}

async function setUserImage(uid, image, timestamp) {
  const ts = timestamp ? Number(timestamp) : Math.floor(Date.now() / 1000);

  if (!image) {
    return deleteUserImage(uid);
  }

  const cleanBase64 = image.replace(
    /^data:image\/[a-zA-Z0-9+.-]+;base64,/,
    ''
  );
  const rawBuffer = Buffer.from(cleanBase64, 'base64');

  if (!rawBuffer.length) {
    return {
      invalidFormat: true,
      user_id: uid,
      success: false,
      errors: enrichFaceErrors([
        {
          code: 1,
          message: 'Image file not recognized. Image should be either JPG or PNG.',
        },
      ]),
    };
  }

  let binaryBuffer;
  try {
    binaryBuffer = await sharp(rawBuffer)
      .rotate()
      .resize({
        width: 1024,
        height: 1024,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
  } catch {
    return {
      invalidFormat: true,
      user_id: uid,
      success: false,
      errors: enrichFaceErrors([
        {
          code: 1,
          message: 'Image file not recognized. Image should be either JPG or PNG.',
        },
      ]),
    };
  }

  const config = getAddonConfig();
  const session = await getValidSession(config);
  const query = new URLSearchParams({
    session,
    user_id: String(uid),
    timestamp: String(ts),
    match: '1',
  });

  const url = `http://${config.device_ip}/user_set_image.fcgi?${query.toString()}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(binaryBuffer.length),
    },
    body: binaryBuffer,
    signal: AbortSignal.timeout(10000),
  });

  const data = await response.json().catch(() => null);

  if (!data) {
    if (response.status === 401) invalidateSession();
    throw new DeviceApiError(
      `Resposta inválida do Control iD em user_set_image.fcgi (HTTP ${response.status}).`,
      response.status || 502,
      'SET_IMAGE_ERROR'
    );
  }

  return {
    user_id: data.user_id ?? uid,
    scores: data.scores || null,
    success: Boolean(data.success),
    errors: enrichFaceErrors(data.errors || []),
  };
}

module.exports = {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  getUserImage,
  setUserImage,
  deleteUserImage,
};