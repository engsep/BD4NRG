// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.7.0 <0.9.0;

contract BD4NRG_ProofOfExistence {
  mapping (bytes32 => string) private proofs;
  event Registered(bytes32);

  function getProof(string calldata data) public pure returns (bytes32) {
    return keccak256(bytes(data));
  }
  
  function registerData(string calldata data) external returns (bytes32) {
    bytes32 hash = getProof(data);
    require(bytes(proofs[hash]).length == 0, "data already registered.");
    proofs[hash] = data;
    emit Registered(hash);
    return hash;
  }

  function getData(bytes32 proof) external view returns (string memory) {
    return proofs[proof];
  }

  function validateData(string calldata data) external view returns (bool) {
    return validateProof(getProof(data));
  }

  function validateProof(bytes32 proof) public view returns (bool) {
    return bytes(proofs[proof]).length > 0;
  }
}