const fs    = require('fs');
const chalk = require('cli-color');
const utils = require('./utils');

const _defaultOptions = {
};

/**
 * Abstract class for deploying smartcontract
 */
class ContractDeployer {
  constructor() {
    this.contractMapping = {
      contracts: {},
      status: {}
    };
  }

  async init() {
  }

  getWeb3() {
    return null;
  }

  setConfig({dataFilename, deployData, proxyAdminName, proxyName, options = {}}) {
    this.dataFilename = dataFilename;
    this.deployData = deployData;
    this.proxyAdminName = proxyAdminName;
    this.proxyName = proxyName;
    this.options = Object.assign({}, _defaultOptions, options);
  }

  async deployAllManifests({
    excludes: exclusion, // list of manifest exlcuded from this operation
    args: margs // arguments for manifests
  }) {
    exclusion = exclusion || []
    for (const name in this.deployData.contracts) {
      const args = margs[name] || {}
      if (!name.startsWith('@') && !exclusion.includes(name)) { 
        await this.deployManifest({ 
          name: name, 
          implArgs: args.implArgs || [], 
          initArgs: args.initArgs || [],
          libs: args.libs || [] 
        }) 
      }
    }
  }

  async deployManifest({
    name, // (mandatory) name of an item to deploy
    implArgs,
    initArgs,
    libs,
    bind // (optional) return the bound contract instance to deployed address
  }) {
    let manifest = this.deployData.contracts[name]
    this.PROXY_ADMIN_CONTRACT = this.deployData.contracts[this.proxyAdminName]
    this.Proxy = await this.loadContractArtifact(this.proxyName);
  
    if (manifest == undefined) {
      console.log('Manifest not found: ', name)
      return undefined
    }
    
    libs     = this.formatValues(libs)
  
    console.log(`\nContract ${chalk.yellowBright(name)} (${chalk.yellow(this.contractName(name))})`)
    const contract = await this.loadContractArtifact(name, libs).catch(err => { console.log(`No artifact ${name}`) })
    if (contract == null || contract == undefined) { return null }

    implArgs = this.formatValues(implArgs)
    initArgs = this.formatValues(initArgs)

    // Link libraries
    if (libs && libs.length > 0) {
      for (let lib of libs) {
        console.log(`\nLink contract ${chalk.yellowBright(name)} to lib ${chalk.yellow(this.contractName(lib))}`)
        let libArtifact = await this.loadContractArtifact(lib).catch(err => { console.log(`No artifact ${lib}`) });
        libArtifact = await this.contractOf(libArtifact, this.deployData.contracts[lib]);
        await this.linkLib(contract, libArtifact);
      }
    }

    let result = null
  
    if (typeof manifest === 'object') {
      // manifest is a proxy item
      const impl = await this.deploy(name, contract, this.formatValue(manifest.impl), ...implArgs)
      let contructorParamLen = 2;
      if ( this.isTruffle()) {
        const proxyConstructor = this.Proxy.toJSON().abi.filter(item => item.type == 'constructor')[0];
        contructorParamLen = proxyConstructor.inputs.length;
      } else {
        contructorParamLen = this.Proxy.interface.deploy.inputs.length;
      }
      
      let proxy;
      if (contructorParamLen == 3) {
        proxy = await this.deploy(
          name + ' proxy', 
          this.Proxy,
          manifest.proxy, 
          this.addressOf(impl), 
          this.PROXY_ADMIN_CONTRACT, 
          []
        );
      } else {
        proxy = await this.deploy(
          name + ' proxy', 
          this.Proxy,
          manifest.proxy, 
          this.addressOf(impl), 
          this.PROXY_ADMIN_CONTRACT
        );
      }
  
      const proxyAdminContract = await this.updateProxyAdmin(proxy)
  
      if (utils.isNullOrEmpty(manifest.proxy)) {
        // initialize the proxy with given args
        if (utils.isNullOrEmpty(manifest.impl)) { manifest.impl = this.addressOf(impl) }
        manifest.proxy = proxy.address
        this.writeJson(this.deployData)
  
        const proxiedContract = await this.contractOf(contract, proxy.address)
        console.log(`[${chalk.yellow(name)} proxy] initialize proxy: ${chalk.green(manifest.proxy)}...`)
        let tx = await this.waitFor(await proxiedContract.initialize(...initArgs));
        console.log(`\t\t(TxId: ${chalk.blue(tx.hash || tx.tx)})`)
      } else if (utils.isNullOrEmpty(manifest.impl)) {
        // update the new impl contract for the proxy
        manifest.impl = this.addressOf(impl)
        manifest.proxy = this.addressOf(proxy)
        this.writeJson(this.deployData)
  
        console.log(`[${chalk.yellow(name)} proxy] set impl logic: ${chalk.green(manifest.impl)}...`)
        let tx = await this.waitFor(await proxyAdminContract.upgrade(manifest.proxy, manifest.impl));
        console.log(`\t\t(TxId: ${chalk.blue(tx.hash || tx.tx)})`)
      } else {
        // checking if the impl contract is complied with the proxy
        const currentImpl = await this.getImpl(proxy)
        const jsonImpl = this.formatValue(manifest.impl)
  
        if (currentImpl != jsonImpl) {
          console.log(`[${chalk.yellow(name)} proxy] set impl logic from ${currentImpl} -> ${chalk.green(jsonImpl)}...`)
          let tx = await this.waitFor(await proxyAdminContract.upgrade(manifest.proxy, jsonImpl));
          console.log(`\t\t(TxId: ${chalk.blue(tx.hash || tx.tx)})`)
        }
      }
  
      // result = bind ? await contractOf(contract, proxy) : proxy
      result = await this.contractOf(contract, manifest.proxy)
    } else {
      result = await this.deploy(name, contract, manifest, ...implArgs)
      this.deployData.contracts[name] = this.addressOf(result)
      this.writeJson(this.deployData)
    }
    this.contractMapping.contracts[name] = result
    return result
  }  

  async grantRoles() {
    for (const contractName in this.deployData.roles) {
      await this.grantRole(contractName, this.deployData.roles[contractName])
    }
  }

  async grantRole(contractName, roleData) {
    console.log(`\nRole configuration for ${chalk.yellow(contractName)}...`)
  
    const contract = await this.loadContract(contractName)
    for (let role in roleData) {
      let isGrant = true;
      const addresses = this.formatValues(roleData[role])
      if (role.startsWith("-")) {
        isGrant = false;
        role = role.substring(1);
      }
      const roleId = this.getWeb3().utils.keccak256(role)
  
      if (isGrant) {
        // Grant roles
        for (let idx = 0; idx < addresses.length; idx++) {
          let addr = addresses[idx];
          if (!utils.isNullOrEmpty(addr)) {
            const assigned = await contract.hasRole(roleId, addr)
            if (assigned) { 
              console.log(`\tRole ${chalk.blueBright(role)}: ${chalk.green(addr)} (${chalk.yellowBright('GRANTED')})`) 
            } else {
              console.log(`\t${chalk.green('Granting')} role ${chalk.blueBright(role)} for ${chalk.green(addr)}`)
              let tx = await this.waitFor(await contract.grantRole(roleId, addr));
              console.log(`\t\t(TxId: ${chalk.blue(tx.hash || tx.tx)})`)
            }
          }
        }
      } else {
        // Revoke roles
        for (let idx = 0; idx < addresses.length; idx++) {
          let addr = addresses[idx];
          if (!utils.isNullOrEmpty(addr)) {
            const assigned = await contract.hasRole(roleId, addr)
            if (assigned) { 
              console.log(`\t${chalk.redBright('Revoking')} role ${chalk.blueBright(role)} for ${chalk.green(addr)}`)
              let tx = await this.waitFor(await contract.revokeRole(roleId, addr));
              console.log(`\t\t(TxId: ${chalk.blue(tx.hash || tx.tx)})`)
            } else {
              console.log(`\tRole ${chalk.blueBright(role)}: ${chalk.green(addr)} (${chalk.yellowBright('NO GRANT')})`) 
            }
          }
        }
      }
    }
  }

  writeJson(data) {
    const content = JSON.stringify(data, null, 4);
    fs.writeFileSync(this.dataFilename, content);
  }

  contractName(name) {
    const result = this.deployData.mapping[name]
    if (result == null || result == undefined) { return name }
    return result
  }

  formatValues(values) {
    const result = []
    for (let i = 0; i < values.length; i++) {
      if (Array.isArray(values[i])) { result.push(this.formatValues(values[i])) } else { result.push(this.formatValue(values[i])) }
    }
    return result
  }
  
  formatValue(value) {
    if (value == null || value == undefined) 
      return null;
    if (typeof (value) === 'string') {
      if (value.startsWith('ether:')) { return this.getWeb3().utils.toWei(value.substring('ether:'.length)) }
      if (value.startsWith('config:')) {
        const name = value.substring('config:'.length)
        return this.formatValue(this.deployData.config[name])
      }
      if (value.startsWith('keccak:')) {
        return this.getWeb3().utils.keccak256(value.substring('keccak:'.length))
      }
      if (value.startsWith('address:')) {
        const name = value.substring('address:'.length)
        const manifest = this.deployData.contracts[name]
        if ( typeof(manifest) == 'object') { 
          return manifest.proxy 
        }
        return manifest
      }
    }
    if (Array.isArray(value)) { return this.formatValues(value) }
    if (typeof(value) === 'boolean' || typeof(value) === 'number')
      return value;
    return value.toString()
  }

  addressOf(contract) {
    if (typeof contract === 'object') { return contract.address }
    return contract
  }

  async updateProxyAdmin(proxy) {
    const proxyAdmin = await this.proxyAdminContract()
    if (!(await proxyAdmin.isAdminOf(this.addressOf(proxy)))) {
      console.log(`\tUpdate proxy admin to ${this.proxyAdminName} contract...`, this.addressOf(proxyAdmin))
      const proxyContract = await this.contractOf(this.Proxy, this.addressOf(proxy))
      // await proxyContract.connect(PROXY_ADMIN).changeAdmin(addressOf(proxyAdmin))
      // let tx = await this.waitFor(await proxyContract.connect(this.PROXY_ADMIN_CONTRACT).changeAdmin(this.addressOf(proxyAdmin)))
      let tx = await this.waitFor(await proxyContract.changeAdmin(this.addressOf(proxyAdmin)))
      console.log(`\t\t(TxId: ${chalk.blue(tx.hash || tx.tx)})`)
    }
    return proxyAdmin
  }

  async proxyAdminContract() {
    return await this.loadContract(this.proxyAdminName)
  }

  async loadContract(name) {
    const value = this.contractMapping.contracts[name]
    const contract = await this.loadContractArtifact(name)
    if (!value) {
      const contractInstance = await this.contractOf(contract, value)
      this.contractMapping.contracts[name] = contractInstance
    }
    return await this.contractOf(contract, this.contractMapping.contracts[name])
  }

  async getImpl(proxy) {
    const addr = this.addressOf(proxy)
    // let value = await hre.ethers.provider.getStorageAt(addr, '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc')
    // value = value.replace('0x000000000000000000000000', '0x')
    let contract = await this.proxyAdminContract();
    let value = await contract.getProxyImplementation(addr);
    return this.getWeb3().utils.toChecksumAddress(value)
  }

  async run(func) {
    await func(this);
  }

  async waitFor(obj) {
    return Promise.resolve(obj);
  }

  isHardhat() {
    return this.type == 'hardhat';
  }

  isTruffle() {
    return this.type == 'truffle';
  }
}

module.exports = ContractDeployer;