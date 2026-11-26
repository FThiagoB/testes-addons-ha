const fs = require('fs');

function getAddonConfig() {
  const optionsPath = '/data/options.json';
  let fileConfig = {
    device_ip: process.env.DEVICE_IP || '192.168.1.100',
    device_login: process.env.DEVICE_LOGIN || 'root',
    device_password: process.env.DEVICE_PASSWORD || '',
  };

  if (fs.existsSync(optionsPath)) {
    fileConfig = {
      ...fileConfig,
      ...JSON.parse(fs.readFileSync(optionsPath, 'utf8')),
    };
  }

  return { ...fileConfig };
}

module.exports = { getAddonConfig };