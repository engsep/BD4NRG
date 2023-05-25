const StorageSlot = artifacts.require("StorageSlot");
const TokenContract = artifacts.require("BD4NRGToken");
const TransactionProcessor = artifacts.require("TransactionProcessor");
const ProxyContract = artifacts.require("Proxy");
const AdminContract = artifacts.require("AdminContract")

module.exports = async function(deployer) {
  await deployer.deploy(StorageSlot);
  await deployer.deploy(TokenContract);
  const tokenContractInstance = await TokenContract.deployed();
  const tokenAddress = await tokenContractInstance.address;
  await deployer.deploy(TransactionProcessor, tokenAddress);
  const proxyInstance = await deployer.deploy(ProxyContract);
  const proxyAddress = await proxyInstance.address;
  await deployer.deploy(AdminContract, proxyAddress);
  await deployer.link(StorageSlot, ProxyContract);
};
