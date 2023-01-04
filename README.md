# How to use

- [Deploy with Truffe](#deploy-with-truffle)
- [Deploy with Hardhat](#deploy-with-hardhat)
- [Configuring network file](#configuring-network-file)
- [Configuring deployment manifest](#configuring-deployment-manifest)

# Deploy with Truffle

## File structure

```
├── contracts
│   ├── MyProxy.sol
│   └── MyProxyAdmin.sol
├── migrations
│   └── 1_deploy.js
├── network
│   └── testnet.json
├── package.json
├── truffle-config.js
```

## Add network in `truffle-config.js` file

```js
const HDWalletProvider = require('@truffle/hdwallet-provider');

module.exports = {
  networks: {
    "testnet": {
      provider: new HDWalletProvider('MNEMONIC', 'https://goerli.infura.io/v3/', 0, 1, true, "m/44'/60'/0'/0/", 5);,
      network_id: "*",
    }
  }
}
```

## Update package.json 

```json
"scripts": {
  "deploy:testnet": "truffle migrate --network testnet --reset --f 1 --to 1",
}
```

## Add deploy script in `1_deploy.js`

```js
const Web3 = require('web3');
const ContractDeployerWithTruffle = require('@evmchain/contract-deployer/src/truffle');
const { networks } = require('../truffle-config.js')

module.exports = async function (deployer, network, accounts) {
  const { provider } = (networks[network] || {})
  const web3 = new Web3(provider);
  const deployConfig = {
    dataFilename: `./network/${network}.json`,
    deployData: require(`../network/${network}.json`),
    proxyAdminName: "MyProxyAdmin",
    proxyName: "MyProxy"
  }

  const contractDeployer = new ContractDeployerWithTruffle({artifacts, deployer});
  contractDeployer.setWeb3(web3);
  contractDeployer.setConfig(deployConfig);

  // Initialize
  await contractDeployer.init();
  // Start deploy 
  await contractDeployer.deployAllManifests({
    args: {
      MyGame: { 
        initArgs: [
          "config:usdc.address", 
          "address:MyToken"
        ] 
      } // See the format of params below
    }
  });

  await contractDeployer.grantRoles();
}
```
  - See more in [Configuring deployment manifest](#configuring-deployment-manifest)


## Create `testnet.json` file

- See [Configuring network file](#configuring-network-file)

## Run deploy

```
npm run deploy:testnet
```

# Deploy with Hardhat

## File structure

```
├── contracts
│   ├── MyProxy.sol
│   └── MyProxyAdmin.sol
├── scripts
│   └── deploy.js
├── network
│   └── testnet.json
├── package.json
├── hardhat.config.js
```

## Add network in `hardhat.config.js` file

```ts
require('dotenv').config()
require("@nomicfoundation/hardhat-toolbox");
require('@nomiclabs/hardhat-ethers')
require('@nomiclabs/hardhat-etherscan')
require('@nomiclabs/hardhat-web3')

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.7',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    "testnet": {
      url: "http://127.0.0.1:8545/",
      accounts: ['YOUR-PRIVATE-KEY']
    }
  }
};

```

## Update package.json 

```json
"scripts": {
  "deploy:testnet": "npx hardhat run scripts/deploy.js --network testnet",
}
```

## Add deploy script in `deploy.js`

```js
const hre = require("hardhat");
const { ethers } = hre
const { web3 } = require('hardhat')
const { ContractDeployerWithHardhat } = require('@evmchain/contract-deployer');

async function main() {
  network = hre.network.name
  
  const deployConfig = {
    dataFilename: `./network/${network}.json`,
    deployData: require(`../network/${network}.json`),
    proxyAdminName: "MyProxyAdmin",
    proxyName: "MyProxy"
  }

  const contractDeployer = new ContractDeployerWithHardhat();
  contractDeployer.setConfig(deployConfig);

  // Init
  await contractDeployer.init();
  // Deploy contract
  await contractDeployer.deployAllManifests({
    args: {
      MyGame: { 
        initArgs: [
          "config:usdc.address", 
          "address:MyToken"
        ] 
      } // See the format of params below
    }
  });

  // Grant roles
  await contractDeployer.grantRoles();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

```
  - See more in [Configuring deployment manifest](#configuring-deployment-manifest)


## Create `testnet.json` file

- See [Configuring network file](#configuring-network-file)

## Run deploy

```
npm run deploy:testnet
```

# Configuring network file

```json
{
    "contracts": {
        "MyProxyAdmin": "",
        "MyToken": "",
        "MyGame": {
            "proxy": "",
            "impl": ""
        }
    },
    "mapping": {},
    "roles": {
        "MyGame": {
            "OPERATOR_ROLE": [
                "0x7be0B9AEc2e1963C997dee5692a4B44584470A10",
                "0xb26f0A1dd9c3971A7C5cd67f48C5059A0e1cdA80",
                "0x549A523C18F9CFF9Cf50F2f3317abAd479B8f416"
            ],
            "-OPERATOR_ROLE": [
                "0x692e2a431f051885f3badecf10c0562d1d195974"
            ]
        }
    },
    "config": {
        "usdc.address": "0x80c3a8Bfc9713DB8C3B7562B542745fCf224246a"
    }
}
```
* Revoke role by adding minus symbol before the role name

# Configuring deployment manifest

```javascript
  await contractDeployer.deployAllManifests({
    args: {
      MyGame: { 
        initArgs: [
          "config:usdc.address", 
          "address:MyToken"
        ] 
      } // See the format of params below
    }
  })
```
  - Params:
    - implArgs: parameters to pass to contructor
    - initArgs: parameters to init proxy
  - Format values:
    - `config:usdc.address` get from config
    - `address:MyToken` address of MyToken
    - `ether:1` convert to wei
    - `keccak:` get keccak value