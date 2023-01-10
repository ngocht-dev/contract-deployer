const chalk            = require('cli-color');
const ContractDeployer = require('./contract-deployer');
const utils            = require('./utils');

/**
 * Deploy smartcontract by using Truffle
 */
class ContractDeployerWithTruffle extends ContractDeployer {
  constructor({ artifacts, deployer}) {
    super();
    this.artifacts = artifacts;
    this.deployer = deployer;
    this.type = 'truffle';
  }

  setWeb3(web3) {
    this.web3 = web3;
  }

  getWeb3() {
    return this.web3;
  }

  async deploy(name, contract, address, ...args) {
    if (!utils.isNullOrEmpty(address)) {
      console.log(`[${chalk.yellow(name)}] at ${chalk.green(address)}`)
      return address
    }
    console.log(`\tDeploy contract: ${chalk.blueBright(name)}, args: `, args)
    const ins = await this.deployer.deploy(contract,...args)
  
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
    const contract = this.artifacts.require(artifactName);
    return contract
  }

  async contractOf(contract, value) {
    if (typeof value === 'object') { return value }
    return await contract.at(value);
  }

}

module.exports = ContractDeployerWithTruffle;