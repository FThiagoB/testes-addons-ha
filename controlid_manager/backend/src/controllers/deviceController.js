const deviceService = require('../services/deviceService');
const { handleApiError } = require('../errors/errorHandler');

function getStatus(req, res) {
  return res.json(deviceService.getDeviceStatus());
}

async function getScreenshot(req, res) {
  try {
    const result = await deviceService.captureScreenshot();
    return res.json(result);
  } catch (error) {
    handleApiError(res, error);
  }
}

async function enrollCard(req, res) {
  try {
    const result = await deviceService.remoteEnrollCard();
    if (!result.success) {
      return res.status(422).json(result);
    }
    return res.json(result);
  } catch (error) {
    handleApiError(res, error);
  }
}

async function cancelEnroll(req, res) {
  try {
    const result = await deviceService.cancelRemoteEnroll();
    return res.json(result);
  } catch (error) {
    handleApiError(res, error);
  }
}

module.exports = {
  getStatus,
  getScreenshot,
  enrollCard,
  cancelEnroll,
};