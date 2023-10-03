const fs = require('fs')
const path = require('path')

/**
 * 
 * @param {string} path 
 */
function loadJson(path) {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}

/**
 * 
 * @param {string} value 
 */
function isNullOrEmpty(value) {
    return value == undefined || value == null || value.trim() == "";
}

/**
 * 
 * @param {string} wallet 
 */
function createAccount(mnemonicOrPrivateKey) {
    if (isNullOrEmpty(mnemonicOrPrivateKey))
        throw new Error("Emppty account");

    if (mnemonicOrPrivateKey.indexOf(' ') > 0) // mnemonic phrase
        return {
            mnemonic: mnemonicOrPrivateKey,
            path: "m/44'/60'/0'/0",
            initialIndex: 0,
            count: 4,
            passphrase: ""
        };

    return [mnemonicOrPrivateKey];  // private key
}

function createNetwork(data) {
    let accountName = (data.account || 'wallet').toUpperCase();
    let mnemonicOrKey = process.env[`ACCOUNT_${accountName}`] || process.env[accountName] || data.account;
    let network = data;
    network.accounts = createAccount(mnemonicOrKey);
    return network;
}

/**
 * 
 * @param {string} name 
 * @param {*} data 
 */
function createCustomChain(name, data) {
    let chain = {
        network: name,
        urls: {
            browserURL: data.explorer,
            apiURL: data.apiURL || `${data.explorer}/api`
        }
    }
    chain.chainId = data.chainId || data.network_id;
    return chain;
}

/**
 * 
 * @param {string} networkPath 
 */
function loadNetworks(networkPath) {
    let files = fs.readdirSync(networkPath);
    let networks = {};
    let etherscan = {
        apiKey: {},
        customChains: []
    }
    for (const idx in files) {
        let filename = files[idx].split('.');
        if (filename.length != 2 || filename[1].toLowerCase() != "json" ) continue;
        
        let data = loadJson(path.join(networkPath, files[idx])).network;
        
        if (data == undefined) continue;

        let networkName = filename[0];
        networks[networkName] = createNetwork(data);
        etherscan.apiKey[networkName] = data.apiKey || process.env[`ETHERSCAN_API_${networkName.replace('-', '_').toUpperCase()}`] || 'dummy-key';
        etherscan.customChains.push(createCustomChain(networkName, data));
    }

    return {
        networks: networks,
        etherscan: etherscan
    }
}

module.exports = {
    loadNetworks
}