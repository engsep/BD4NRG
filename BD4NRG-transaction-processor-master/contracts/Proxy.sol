// SPDX-License-Identifier: UNLICENSED

/**
 * @title Transactions Processor Proxy - BD4NRG Marketplace
 * @author Andrea d'Auria, 2023
 *
 * @dev Proxy contract meant to forward calls (with delegation) to the implementation
 * contract. It holds the address of the implementation and admin contract
 * and allows for changes of both.
 * The proxy contract holds the context of the implementation contract – data created /
 * provided via the usage of the implementation contract is stored in the proxy storage.
 */

pragma solidity ^0.8.17;

import "./StorageSlot.sol";

contract Proxy {

    /**
	 * @dev IMPLEMENTATION_SLOT and ADMIN_SLOT are the memory slot used to store
     * the addresses of the implementation contract and admin (contract) respectively.
     * Because they are constant they are not saved in the storage of the contract.
     * Instead, they are part of the bytecode. As a result, they don't intefere with
     * the memory layout of the implementation contract.
	 */
    bytes32 private constant IMPLEMENTATION_SLOT =
        bytes32(uint(keccak256("BD4NRG.transactions.processor.implementation.slot")) - 1);
    bytes32 private constant ADMIN_SLOT =
        bytes32(uint(keccak256("BD4NRG.transactions.processor.admin.slot")) - 1);

    constructor() {
        // In production the admin contract would be deployed first, and its address
        // would supplied to the constructor at the time of proxy deployment.
        _setAdmin(msg.sender);
    }

    /**
     * @dev Modifier that checks if the sender is the admin.
     */
    modifier reservedForAdmin() {
        require(msg.sender == _getAdmin(), "This function is reserved for the admin");
        _;
    }

    /**
     * @dev Retrievs the address of the admin from the slot
     * hardcoded in this contract.
     *
     * @return address The address of the admin.
     */
    function _getAdmin() private view returns (address) {
        return StorageSlot.getAddressSlot(ADMIN_SLOT).value;
    }

    /**
     * @dev Writes the address of the admin on the memory slot
     * hardcoded in this contract.
     *
     * @param _admin The new address for the admin.
     */
    function _setAdmin(address _admin) private {
        require(_admin != address(0), "The admin must be a valid address");
        StorageSlot.getAddressSlot(ADMIN_SLOT).value = _admin;
    }

    /**
     * @dev Retrievs the address of the implementation
     * contract from the slot hardcoded in this contract.
     *
     * @return address The address of the implementation contract.
     */
    function _getImplementation() private view returns (address) {
        return StorageSlot.getAddressSlot(IMPLEMENTATION_SLOT).value;
    }

    /**
     * @dev Writes the address of the implementation on the memory slot
     * hardcoded in this contract.
     *
     * @param _implementation The new address for the implementation.
     */
    function _setImplementation(address _implementation) private {
        require(_implementation.code.length > 0, "implementation is not contract");
        StorageSlot.getAddressSlot(IMPLEMENTATION_SLOT).value = _implementation;
    }

    /**
     * @dev External function to change the admin of the contract.
     * Restricted to admin.
     *
     * @param _admin The new address for the admin.
     */
    function changeAdmin(address _admin) external reservedForAdmin {
        _setAdmin(_admin);
    }

    /**
     * @dev External function to change the implementation contract address.
     * Restricted to admin.
     *
     * @param _implementation The new address for the admin.
     */
    function upgradeTo(address _implementation) external reservedForAdmin {
        _setImplementation(_implementation);
    }

    /**
     * @dev External function to view the address of the admin.

     * @return address The address of the admin.
     */
    function admin() external view returns (address) {
        return _getAdmin();
    }

    /**
     * @dev External function to view the address of the implementation contract.

     * @return address The address of the implementation contract.
     */
    function implementation() external view returns (address) {
        return _getImplementation();
    }

    /**
     * @dev Performs a delegatecall to the contract at the given address.
     *
     * @param _implementation The contract address to delegate the call to.
     */
    function _delegate(address _implementation) internal virtual {
        assembly {

            // calldatacopy(t, f, s) - copy s bytes from calldata at position f to mem at position t
            // calldatasize() - size of call data in bytes
            calldatacopy(0, 0, calldatasize())

            // delegatecall(g, a, in, insize, out, outsize)
            // g = gas
            // a = address of contract to call
            // in = memory address of input
            // insize = size of input
            // out = memory address of output
            // outsize = size of output
            // returns 0 on error and 1 on success
            let result := delegatecall(gas(), _implementation, 0, calldatasize(), 0, 0)

            // returndatacopy(t, f, s) - copy s bytes from returndata at position f to mem at position t
            // returndatasize() - size of the last returndata
            returndatacopy(0, 0, returndatasize())

            switch result
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }

    /**
     * @dev Delegates the call to the current implementation contract.
     */
    function _fallback() private {
        _delegate(_getImplementation());
    }

    /**
     * @dev Default function for every call whose message signature
     * is not from a function in this contract.
     */
    fallback() external payable {
        _fallback();
    }

    receive() external payable {
        _fallback();
    }
}