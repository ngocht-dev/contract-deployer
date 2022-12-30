# How to use

- [Deploy with Truffe](#deploy-with-truffle)
- [Deploy with Hardhat](#deploy-with-hardhat)

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

  // start deploy 
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

  await contractDeployer.grantRoles();
}
```
  - Params:
    - implArgs: parameters to pass to contructor
    - initArgs: parameters to init proxy
  - Format values:
    - `config:usdc.address` get from config
    - `address:MyToken` address of MyToken
    - `ether:1` convert to wei
    - `keccak:` get keccak value


## Create `testnet.json` file

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

# Deploy with Hardhat


## Run deploy

```
npm run deploy:testnet
```