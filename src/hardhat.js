const chalk = require('cli-color');
const ContractDeployer = require('./contract-deployer');
const utils = require('./utils');

const hre = require('hardhat')
const { ethers } = hre
const { web3 } = require('hardhat')

/**
 * Deploy smartcontract by using hardhat
 */
class ContractDeployerWithHardhat extends ContractDeployer {
  constructor() {
    super();
    this.network = hre.network.name;
  }

  async init() {
    super.init();
    this.accounts = await hre.ethers.getSigners();
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

  async loadContractArtifact (name) {
    const artifactName = this.contractName(name);
    // const contract = this.artifacts.require(artifactName);
    const contract = await ethers.getContractFactory(artifactName);
    return contract
  }

  async contractOf(contract, value) {
    if (typeof value === 'object') { return value }
    // return await contract.at(value);
    return await contract.attach(value)
  }

}

module.exports = ContractDeployerWithHardhat;