class DeviceApiError extends Error {
  constructor(message, statusCode = 502, code = 'DEVICE_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

module.exports = { DeviceApiError };