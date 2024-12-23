const hre = require("hardhat");
const { web3 } = require("hardhat");
const { ethers } = hre;
const { ContractDeployerWithHardhat } = require("../../index");

async function main() {
  const network = hre.network.name;

  const deployConfig = {
    dataFilename: `./network/${network}.json`,
    deployData: require(`../network/${network}.json`),
    proxyAdminName: "DmtpProxyAdmin",
    proxyName: "DmtpProxy",
  };

  const contractDeployer = new ContractDeployerWithHardhat();

  contractDeployer.setConfig(deployConfig);

  await contractDeployer.init();

  const [owner] = await ethers.getSigners();

  // Deploy contract
  await contractDeployer.deployAllManifests({
    args: {
      DmtpProxyAdmin: {
        implArgs: [owner.address],
      },
      Key: {
        initArgs: ["config:Key.uri", "config:Key.issueLimit"],
      },
      DmtpTech: {
        initArgs: [
          "address:Key",
          "config:DmtpTech.signer",
          "config:DmtpTech.commission.rate",
          "config:DmtpTech.commission.receiver",
          "config:DmtpTech.commission.keyGeneratorRate",
        ],
      },
    },
  });

  // Grant roles
  await contractDeployer.grantRoles();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
