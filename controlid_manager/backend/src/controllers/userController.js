const userService = require('../services/userService');
const { enrichFaceErrors } = require('../constants/faceErrors');
const { handleApiError } = require('../errors/errorHandler');

async function list(req, res) {
  try {
    const users = await userService.listUsers();
    return res.json(users);
  } catch (error) {
    handleApiError(res, error);
  }
}

async function create(req, res) {
  const { id, name, card, pin, admin } = req.body;

  if (
    typeof id !== 'number' ||
    !Number.isFinite(id) ||
    typeof name !== 'string' ||
    name.trim() === '' ||
    typeof admin !== 'boolean' ||
    (pin !== undefined && pin !== null && typeof pin !== 'string') ||
    (card !== undefined && card !== null && typeof card !== 'number')
  ) {
    return res.status(400).json({ error: 'Dados inválidos.' });
  }

  try {
    await userService.createUser({ id, name, card, pin, admin });
    return res.status(201).json({ success: true });
  } catch (error) {
    handleApiError(res, error);
  }
}

async function update(req, res) {
  const originalId = Number(req.params.id);
  if (Number.isNaN(originalId)) {
    return res.status(400).json({ error: 'ID inválido.' });
  }

  try {
    const userResult = await userService.updateUser(originalId, req.body);
    return res.json({ success: true, user: userResult });
  } catch (error) {
    handleApiError(res, error);
  }
}

async function remove(req, res) {
  const userId = Number(req.params.id);
  if (Number.isNaN(userId)) {
    return res.status(400).json({ error: 'ID inválido.' });
  }

  try {
    const result = await userService.deleteUser(userId);
    return res.json(result);
  } catch (error) {
    handleApiError(res, error);
  }
}

async function getImage(req, res) {
  const userId = Number(req.params.id);
  if (Number.isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user_id', code: 1 });
  }

  try {
    const result = await userService.getUserImage(userId);
    if (result.notFound) {
      return res.status(400).json({ error: result.error, code: result.code });
    }
    return res.json(result);
  } catch (error) {
    handleApiError(res, error);
  }
}

async function setImage(req, res) {
  const uid = Number(req.params.id);
  const { image, timestamp } = req.body;

  if (Number.isNaN(uid)) {
    return res.status(400).json({
      user_id: null,
      success: false,
      errors: enrichFaceErrors([{ code: 1, message: 'Invalid user_id' }]),
    });
  }

  try {
    const result = await userService.setUserImage(uid, image, timestamp);
    if (result.invalidFormat) {
      const { invalidFormat, ...payload } = result;
      return res.status(400).json(payload);
    }
    if (!result.success) {
      return res.status(422).json(result);
    }
    return res.json(result);
  } catch (error) {
    handleApiError(res, error);
  }
}

async function deleteImage(req, res) {
  const uid = Number(req.params.id);
  if (Number.isNaN(uid)) {
    return res.status(400).json({
      user_id: null,
      success: false,
      errors: enrichFaceErrors([{ code: 1, message: 'Invalid user_id' }]),
    });
  }

  try {
    const result = await userService.deleteUserImage(uid);
    return res.json(result);
  } catch (error) {
    handleApiError(res, error);
  }
}

module.exports = {
  list,
  create,
  update,
  remove,
  getImage,
  setImage,
  deleteImage,
};