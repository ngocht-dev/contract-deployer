# How to use

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

```
networks: {
  "testnet": {
    provider: 'YOUR PROVIDER',
    network_id: "*",
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
const { ContractDeployerWithTruffer } = require('contract-deployer');
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

  const contractDeployer = new ContractDeployerWithTruffer({artifacts, deployer});
  contractDeployer.setWeb3(web3);
  contractDeployer.setConfig(deployConfig);

  // start deploy 
  await contractDeployer.deployAllManifests({
    args: {
      Token: { initArgs: ["config:usdc.address", "address:MyToken"] }
    }
  })

  await contractDeployer.grantRoles();
}
```
  - Param:
    - implArgs
    - initArgs
  - Format values:
    - `config:usdc.address` get from config
    - `address:MyToken` address of MyToken
    - `ether:1` convert to wei
    - `keccak:`


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
            ]
        }
    },
    "config": {
        "usdc.address": "0x80c3a8Bfc9713DB8C3B7562B542745fCf224246a"
    }
}
```