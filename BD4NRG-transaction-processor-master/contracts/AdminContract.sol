// SPDX-License-Identifier: UNLICENSED

/**
 * @title Admin Contract - BD4NRG Marketplace
 * @author Andrea d'Auria, 2023
 *
 * @dev This contract is meant to be the administrator of the proxy
 * contract, through which a set of administrators can change the
 * implementation contract. It is meant as an example of logics that
 * could be implemented to handle decisions (unanimity, majority, etc.).
 * It is not meant as a complete implementation.
 */

pragma solidity ^0.8.17;

import "./Proxy.sol";

contract AdminContract {

    /**
     * @dev Array of all the admins that have been registered in the contract.
     * Both active and inactive admins are in this array.
     */
    address[] admins;

    /**
     * @dev Mappin of active admins, from address admin to bool (true if active).
     */
    mapping(address => bool) public isAdmin;
    
    /**
     * @dev Address of the proxy contract.
     */
	Proxy public ProxyContract;

    
    /**
     * @dev Maps approval of an implementation contract per admin.
     *
     * admin address => implementation contract address
     */
    mapping(address => address) approvedImplementationContract;

    ////// Events //////
    event ImplementationContractAddressHasChanged(address NewImplementationAddress);
    event ProxyAdminAddressHasChanged(address NewProxyAdminAddress);
    event NewAdmin(address NewAdmin);
    event AdminRemoved(address RemovedAdmin);

    /**
     * @dev Restricts access to functions to ANY of the admins.
     */
    modifier reservedForAdmin() {
        require(isAdmin[msg.sender], "This function can be called only by an admin");
        _;
    }

    /**
     * @dev The constructor sets the address of the proxy contract and the sender as the first
     * admin. In production the constructor should be modified to take as parameter the addresses
     * of the first set of admins, so that they can be set right away at deployment time.
     *
     * @param proxyContractAddress Address of the proxy contract.
     */
    constructor(Proxy proxyContractAddress) {
        admins.push(msg.sender);
        isAdmin[msg.sender] = true;
        ProxyContract = proxyContractAddress;
    }

    /**
     * @dev Preapproves a new implementation address. Necessary step to make it so that all admins
     * agree on a specific new address before changing it.
     *
     * @param newImplementationAddr Address of the new implementation contract.
     */
    function approveNewImplementationAddress(address newImplementationAddr) public reservedForAdmin {
        approvedImplementationContract[msg.sender] = newImplementationAddr;
    }

    /**
     * @dev Checks that all active admins have preapproved the right address, and if so it calls
     * the proxy contract and changes the implementation contract address.
     *
     * @param newImplementationAddr Address of the new implementation contract.
     */
    function changeImplementationAddress(address newImplementationAddr) public reservedForAdmin {
        for(uint i; i < admins.length; i++) {
            if(isAdmin[admins[i]]) require(
                approvedImplementationContract[admins[i]] == newImplementationAddr,
                "Not all admins have approved the new implementation address");
        }

        ProxyContract.upgradeTo(newImplementationAddr);
        emit ImplementationContractAddressHasChanged(newImplementationAddr);
    }
    
    /**
     * @dev Changes the address of the admin in the proxy contract. After calling this function
     * this contract will no longer be able to operate on the proxy contract, it will be substituted
     * by the new admin contract.
     * Note Unsafe example, in production you want to require more than the sender just being an admin.
     *
     * @param newAdminContractAddress The address of the new admin contract.
     */
     function changeProxyAdmin(address newAdminContractAddress) public reservedForAdmin {
        // The new admin shouldn't be a single EOA. If that is really wanted one can still go through an intermidiate
        // contract that doesn't enforce this rule when changing the admin address.
        require(newAdminContractAddress.code.length > 0, "The new admin address is not a contract address");

        ProxyContract.changeAdmin(newAdminContractAddress);

        emit ProxyAdminAddressHasChanged(newAdminContractAddress);
     }

    /**
     * @dev Adds a new admin. Any admin can add new admin.
     * Note In production you want to make it harder to add admins.
     *
     * @param newAdmin The address of the new admin.
     */
    function addNewAdmin(address newAdmin) public reservedForAdmin {
        admins.push(newAdmin);
        isAdmin[newAdmin] = true;

        emit NewAdmin(newAdmin);
    }

    /**
     * @dev Marks an admin as inactive.
     * Note It does not remove an admin from `admins` array.
     * Note IMPORTANT: Not safe in production, admin removal should come after some
     * consensus logic among admins, or from a super admin. Here it is kept with this
     * simpler unsafe version just for testing purpose.
     *
     * @param adminToRemove Address of the admin to be removed
     */
    function removeAdmin(address adminToRemove) public reservedForAdmin {
        isAdmin[adminToRemove] = false;

        emit AdminRemoved(adminToRemove);
    }

    /**
     * @dev Returns an array with all the admins registered in the contract.
     * Note It returns also inactive admins.
     *
     * @return listOfAdmins It returns an array with all admins' addresses.
     */
    function getAdmins() public view returns(address[] memory) {
        return admins;
    }

    /**
     * @dev Returns the address of the proxy contract that this contract administers.
     *
     * @return address The address of the proxy contract.
     */
    function proxyAddress() public view returns (address) {
        return address(ProxyContract);
    }

    /**
     * @dev Returns the address of the implementation contract registered in the proxy.
     *
     * @return address The address of the implementation contract.
     */
    function implementationAddress() public view returns (address) {
        return ProxyContract.implementation();
    }
    
}