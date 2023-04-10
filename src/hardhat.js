const chalk            = require('cli-color');
const hre              = require('hardhat')
const ContractDeployer = require('./contract-deployer');
const utils            = require('./utils');


/**
 * Deploy smartcontract by using hardhat
 */
class ContractDeployerWithHardhat extends ContractDeployer {
  constructor() {
    super();
    this.network = hre.network.name;
    this.type = "hardhat";
  }

  async init() {
    super.init();
    this.accounts = await hre.ethers.getSigners();
  }

  getWeb3() {
    return hre.web3;
  }

  async deploy(name, contract, address, ...args) {
    if (!utils.isNullOrEmpty(address)) {
      console.log(`[${chalk.yellow(name)}] at ${chalk.green(address)}`)
      return address
    }
    console.log(`\tDeploy contract: ${chalk.blueBright(name)}, args: `, args)
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

  async linkLib(contract, libArtifact) {
    // nope
  }

  async loadContractArtifact (name, libs = []) {
    const artifactName = this.contractName(name);

    if (libs && libs.length > 0) {
      const libraries = [];
      for (let lib of libs) {
        console.log(`\nLink contract ${chalk.yellowBright(name)} to lib ${chalk.yellow(this.contractName(lib))}`)
        libraries[lib] = this.deployData.contracts[lib];
      }
      const contract = await ethers.getContractFactory(artifactName, { libraries });
      return contract
    } else {
      const contract = await ethers.getContractFactory(artifactName);
      return contract
    }
  }

  async contractOf(contract, value) {
    if (typeof value === 'object') { return value }
    return await contract.attach(value)
  }

}

module.exports = ContractDeployerWithHardhat;