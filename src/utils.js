const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

async function wait (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isNullOrEmpty (addr) {
  return addr == null || addr == undefined || addr == ''
}

module.exports = {
  wait,
  isNullOrEmpty,
  ZERO_ADDRESS
}