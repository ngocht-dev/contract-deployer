const Web3 = require('web3');
const fs = require('fs');
const chalk = require('cli-color');
const ContractDeployer = require('./contract-deployer');
const utils = require('./utils');

const hre = require('hardhat')
const { ethers } = hre
const { web3 } = require('hardhat')

class ContractDeployerWithHardhat extends ContractDeployer {
  constructor() {
    super();
    // this.artifacts = artifacts;
    // this.deployer = deployer;
    // this.contractMapping = {
    //   contracts: {},
    //   status: {}
    // };

    this.network = hre.network.name;
  }

  async init() {
    this.accounts = await hre.ethers.getSigners();
  }

  setConfig({dataFilename, deployData, proxyAdminName, proxyName}) {
    this.dataFilename = dataFilename;
    this.deployData = deployData;
    this.proxyAdminName = proxyAdminName;
    this.proxyName = proxyName;
  }

  async deployAllManifests({
    excludes: exclusion, // list of manifest exlcuded from this operation
    args: margs // arguments for manifests
  }) {
    exclusion = exclusion || []
    for (const name in this.deployData.contracts) {
      const args = margs[name] || {}
      if (!name.startsWith('@') && !exclusion.includes(name)) { await this.deployManifest({ name: name, implArgs: args.implArgs || [], initArgs: args.initArgs || [] }) }
    }
  }

  async deployManifest({
    name, // (mandatory) name of an item to deploy
    implArgs,
    initArgs,
    bind // (optional) return the bound contract instance to deployed address
  }) {
    let manifest = this.deployData.contracts[name]
    this.PROXY_ADMIN_CONTRACT = this.deployData.contracts[this.proxyAdminName]
    // this.Proxy = this.artifacts.require(this.proxyName);
    this.Proxy = await ethers.getContractFactory(this.proxyName);
  
    if (manifest == undefined) {
      console.log('Manifest not found: ', name)
      return undefined
    }
  
    console.log(`\nContract ${chalk.yellowBright(name)} (${chalk.yellow(this.contractName(name))})`)
    const contract = await this.loadContractArtifact(name).catch(err => { console.log(`No artifact ${name}`) })
    if (contract == null || contract == undefined) { return null }
  
    implArgs = this.formatValues(implArgs)
    initArgs = this.formatValues(initArgs)
  
    let result = null
  
    if (typeof manifest === 'object') {
      // manifest is a proxy item
      const impl = await this.deploy(name, contract, this.formatValue(manifest.impl), ...implArgs)
      const proxy = await this.deploy(name + ' proxy', this.Proxy,
        manifest.proxy, this.addressOf(impl), this.PROXY_ADMIN_CONTRACT)
  
      const proxyAdminContract = await this.updateProxyAdmin(proxy)
  
      if (utils.isNullOrEmpty(manifest.proxy)) {
        // initialize the proxy with given args
        if (utils.isNullOrEmpty(manifest.impl)) { manifest.impl = this.addressOf(impl) }
        manifest.proxy = proxy.address
        this.writeJson(this.deployData)
  
        // const proxiedContract = await contract.at(proxy.address)
        const proxiedContract = await contract.attach(proxy.address)
        console.log(`[${chalk.yellow(name)} proxy] initialize proxy: ${chalk.green(manifest.proxy)}...`)
        // console.log('proxiedContract :>> ', proxiedContract);
        await (await proxiedContract.initialize(...initArgs)).wait()
        // await proxiedContract.initialize(...initArgs)
      } else if (utils.isNullOrEmpty(manifest.impl)) {
        // update the new impl contract for the proxy
        manifest.impl = this.addressOf(impl)
        manifest.proxy = this.addressOf(proxy)
        this.writeJson(this.deployData)
  
        // let proxyContract = await Proxy.attach(manifest.proxy);
        console.log(`[${chalk.yellow(name)} proxy] set impl logic: ${chalk.green(manifest.impl)}...`)
        // await proxyContract.connect(PROXY_ADMIN).upgradeTo(manifest.impl);
        await (await proxyAdminContract.upgrade(manifest.proxy, manifest.impl)).wait()
        // await proxyAdminContract.upgrade(manifest.proxy, manifest.impl)
      } else {
        // checking if the impl contract is complied with the proxy
        const currentImpl = await this.getImpl(proxy)
        const jsonImpl = this.formatValue(manifest.impl)
  
        if (currentImpl != jsonImpl) {
          console.log(`[${chalk.yellow(name)} proxy] set impl logic from ${currentImpl} -> ${chalk.green(jsonImpl)}...`)
          await (await proxyAdminContract.upgrade(manifest.proxy, jsonImpl)).wait()
          // await proxyAdminContract.upgrade(manifest.proxy, jsonImpl)
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

  async deploy(name, contract, address, ...args) {
    if (!utils.isNullOrEmpty(address)) {
      console.log(`[${chalk.yellow(name)}] at ${chalk.green(address)}`)
      return address
    }
    console.log(`\tDeploy contract: ${chalk.blueBright(name)}, args: `, args)
    // const ins = await this.deployer.deploy(contract,...args)
    const ins = await contract.deploy(...args)
    await ins.deployed()
  
    // Disable verify
    // if (!isNullOrEmpty(process.env.ETHERSCAN_API_KEY)) {
    //   await hre.run('verify:verify', {
    //     address: ins.address,
    //     constructorArguments: args
    //   }).catch(err => {
    //     console.error('Unable to verify source: ', err)
    //     console.log('constructor arguments: ', args)
    //   })
    // }
    return ins
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
      if (role.startsWith("-")) {
        isGrant = false;
        role = role.substring(1);
      }
      const roleId = web3.utils.keccak256(role)
      const addresses = this.formatValues(roleData[role])
  
      if (isGrant) {
        // Grant roles
        for (let idx = 0; idx < addresses.length; idx++) {
          let addr = addresses[idx];
          if (!utils.isNullOrEmpty(addr)) {
            const assigned = await contract.hasRole(roleId, addr)
            if (assigned) { 
              console.log(`\tRole ${chalk.blueBright(role)}: ${chalk.green(addr)} (${chalk.yellowBright('GRANTED')})`) 
            } else {
              console.log(`\tGrantting role ${chalk.blueBright(role)} for ${chalk.green(addr)}`)
              await (await contract.grantRole(roleId, addr)).wait()
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
              console.log(`\tRevoking role ${chalk.blueBright(role)} for ${chalk.green(addr)}`)
              await contract.revokeRole(roleId, addr)
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

  async loadContractArtifact (name) {
    const artifactName = this.contractName(name);
    // const contract = this.artifacts.require(artifactName);
    const contract = await ethers.getContractFactory(artifactName);
    return contract
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
      if (value.startsWith('ether:')) { return web3.utils.toWei(value.substring('ether:'.length)) }
      if (value.startsWith('config:')) {
        const name = value.substring('config:'.length)
        return this.formatValue(this.deployData.config[name])
      }
      if (value.startsWith('keccak:')) {
        return web3.utils.keccak256(value.substring('keccak:'.length))
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
    return value.toString()
  }

  addressOf(contract) {
    if (typeof contract === 'object') { return contract.address }
    return contract
  }

  async updateProxyAdmin(proxy) {
    const proxyAdmin = await this.proxyAdminContract()
    if (!(await proxyAdmin.isAdminOf(this.addressOf(proxy)))) {
      console.log('\tUpdate proxy admin to SuncProxyAdmin contract...', this.addressOf(proxyAdmin))
      const proxyContract = await this.contractOf(this.Proxy, proxy)
      // await proxyContract.connect(PROXY_ADMIN).changeAdmin(addressOf(proxyAdmin))
      await proxyContract.connect(this.PROXY_ADMIN_CONTRACT).changeAdmin(this.addressOf(proxyAdmin))
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

  async contractOf(contract, value) {
    if (typeof value === 'object') { return value }
    // return await contract.at(value);
    return await contract.attach(value)
  }

  async getImpl(proxy) {
    const addr = this.addressOf(proxy)
    // let value = await hre.ethers.provider.getStorageAt(addr, '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc')
    // value = value.replace('0x000000000000000000000000', '0x')
    let contract = await this.proxyAdminContract();
    let value = await contract.getProxyImplementation(addr);
    return web3.utils.toChecksumAddress(value)
  }

  async run(func) {
    await func(this);
  }
}

module.exports = ContractDeployerWithHardhat;