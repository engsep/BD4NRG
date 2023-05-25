// SPDX-License-Identifier: UNLICENSED

/**
 * @title Transactions Processor - BD4NRG Marketplace
 * @author Andrea d'Auria, 2023
 *
 * @dev Core component of the Marketplace in the BD4NRG architecture.
 * It is meant to work as a shared source of truth for both buyers and
 * sellers. Buyers can make their purchases by submitting valid receipts
 * created in cooperation with the sellers, and sellers can verify the
 * validity of such receipts and grant access to the purchased items.
 */


pragma solidity ^0.8.17;

// Import tokens contract
import "./BD4NRGToken.sol";

contract TransactionProcessor {

    ////// Structures //////

	struct Receipt {
		bytes32 hashedReference;
		address buyer;
		uint price;
	}

	////// Data //////

	BD4NRGToken public BD4NRGTokenContract;

	/**
	 * @dev `receipts` maps `receiptID`s (defined as the hash(hashedReference+price)) to `Receipt` objects
	 */
	mapping(bytes32 => Receipt) receipts;

	/**
	 * @dev flag meant as a failsafe mechanism, the admin can stop the contract be setting this to false
	 */
	bool contractIsActive;

	address administrator;

	/**
	 * @dev This flag ensures that the `initializer()` function can be called only once
	 */
	bool hasBeenInitialized;

    ////// Events //////

	event NewReceipt(address indexed buyer, bytes32 hashedReference, address seller, bytes32 receiptID);

    ////// Modifiers //////

     modifier reservedForAdmin() {
        require(msg.sender == administrator, "This function can be called only by the administrator");
        _;
    }

	modifier contractMustBeActive() {
		require(contractIsActive == true, "The contract must be active");
		_;
	}

	/**
	 * @dev The constructor is called at deployment. It sets the address of the token contract, sets it as active and sets the administrator.
	 * In production the constructur should include a flag to render
	 * the contract permanently inactive, so that it can be used only
	 * in the context of the proxy contract.
	 *
	 * @param _tokenContractAddress The address of the ERC20 token used as coin for the transactions in this marketplace
	 */
	constructor(BD4NRGToken _tokenContractAddress) {
        BD4NRGTokenContract = _tokenContractAddress;
		contractIsActive = true;
		administrator = msg.sender;
	}

	/**
	 * @dev It can be considered the constructor for the proxy.
	 * The constructor is not called in the context of the proxy, so all the settings that normally happen there have
	 * to happen again in the context (storage) of the proxy contract.
	 *
	 * @param _tokenContractAddress The address of the ERC20 token used as coin for the transactions in this marketplace
	 */
	function initializer(BD4NRGToken _tokenContractAddress) public {
		// In production this function should be further restricted to be executed by the proxy (contract) only
		require(!hasBeenInitialized, "The contract has already been initialized");
        BD4NRGTokenContract = _tokenContractAddress;
		contractIsActive = true;
		administrator = msg.sender;
		hasBeenInitialized = true;
	}

    ////// Functions //////

	/**
	 * @dev It registers a receipt in the contract storage and moves tokens from the buyer's account to the seller's.
	 * The seller's account is extrapolated from the signature to avoid manual insertion.
	 * It also checks that the price is inserted correctly by re-computing the receiptID obtained by hash(reference+price)
	 *
	 * It's the main function of this contract.
	 *
	 * @param signature The ethereum signature of the seller on the receipt, made with the private key corresponding to
	 * the address where they want to receive the funds.
	 * @param hashedReferenceAndNonce The hash of a unique reference to the item and a unique nonce.
	 * The reference is meant to preserve the link with the off-chain item and the nonce is meant to
	 * hide this link when the hash is posted on chain.
	 * @param receiptID The unique identifier for the receipt obtained by hashing the hashed reference and the price.
	 * @param price The price of the item being purchased.
	 */
	function purchase(bytes memory signature, bytes32 hashedReferenceAndNonce, bytes32 receiptID, uint price) public contractMustBeActive {

		require(receiptDoesNotExist(receiptID), "The receiptID you are using is already associated to another receipt");

		// To avoid reselling of access, for a receipt to be valid the address of the buyer should
		// hold at least an amount of tokens equal to the price of the item. This creates a disincentive
		// to second-sell the receipt. Here the requirement is for it to be twice as much because
		// it assumes that after the purchase half of it will be transfered, leaving a valid receipt.
		require(BD4NRGTokenContract.balanceOf(msg.sender) >= 2*price, "Deposit is insufficient");

		// Safety-check to make sure that the buyer doesn't set a price different from what agreed with the seller
		bytes32 receiptIDrecomputed = keccak256(abi.encodePacked(hashedReferenceAndNonce, price));
		require(receiptID == receiptIDrecomputed, "The price or the hash does not match with the receipt");

		// Ethereaum signature function prepend the undermentioned string to the message
		bytes32 envelopedMsg = keccak256(
                abi.encodePacked("\x19Ethereum Signed Message:\n32", receiptID)
            );
		// Extracting the address of the signer from the signed message
		address seller = recoverSigner(envelopedMsg, signature);

		// Create purchase
		Receipt memory newReceipt = Receipt(hashedReferenceAndNonce, msg.sender, price);
		receipts[receiptID] = newReceipt;

		// Move money in the token contract
		BD4NRGTokenContract.transferFrom(msg.sender, seller, price);
		
		emit NewReceipt(msg.sender, hashedReferenceAndNonce, seller, receiptID);

	}

	/**
	 * @dev It checks if the receipt is valid, as in: the receipt must be cryptographically valid (the signature
	 * of the nonce must be made but the same address of the buyer) and the buyer must have enough deposit.
	 * The reason to enforce a deposit for the validity of the receipt is that we want to discourage resell.
	 * Reselling would imply disclosing the private key of the buyer. By enforcing a deposite we create a big
	 * disincentive to disclose the private key.
	 *
	 * @param receiptID The unique identifier for the receipt used as a key in the `receipts` mapping.
	 * @param nonce A unique piece of data to be signed by the buyer.
	 * @param signedNonce The signature of the nonce.
	 *
	 * @return bool Output indicates whether the receipt is valid.
	 */
	function receiptIsValid(bytes32 receiptID, bytes memory nonce, bytes memory signedNonce) public view returns(bool) {
		Receipt memory receiptToCheck = receipts[receiptID];
		// We used a `require` instead of simply returning a false in order to give
		// better granularity on the reason why the receipt is not valid.
		require(BD4NRGTokenContract.balanceOf(receiptToCheck.buyer) >= receiptToCheck.price, "Deposit is insufficient");

		return verifyReceiptFromID(receiptID, nonce, signedNonce);
	}

	/**
	 * @dev It checks if the receipt is *cryptographically* verified, it does NOT check if a receipt is
	 * valid because it does not check if the buyer still holds enough funds as a guarantee.
	 * A receipt can be cryptographically verified (as in: the signature is valid) and yet not be valid
	 * because the deposit is insufficient.
	 *
	 * @param receiptID The unique identifier for the receipt used as a key in the `receipts` mapping.
	 * @param nonce A unique piece of data to be signed by the buyer.
	 * @param signedNonce The signature of the nonce.
	 *
	 * @return receiptIsVerified It indicates whether the receipt is *cryptographically* verified.
	 */
	function verifyReceiptFromID(bytes32 receiptID, bytes memory nonce, bytes memory signedNonce) public view returns(bool receiptIsVerified) {

		string memory nonce_string = string(nonce);
		return verifySignature(receipts[receiptID].buyer, nonce_string, signedNonce);

	}

	/**
	 * @dev Generic function that verifies the signature validity of a generic message.
	 * It recovers the address of the signer from the signature and it compares it to the
	 * presumed address of the signer. Signature is valid if they are the same.
	 *
	 * @param signer The ethereum address of the signer.
	 * @param message The message that has been signed.
	 * @param signature The signature of the message.
	 *
	 * @return bool Output indicates whether the given signature of the given message is cryptographically verified.
	 */
	function verifySignature(address signer, string memory message, bytes memory signature) public pure returns (bool) {

		// The assumption is that the message is hashed before being signed.
		// This reasonably preserve the link between the original message and,
		// at the same time, makes it easier to handle the signed message as
		// they are of fixed length.
		bytes32 messageHash = keccak256((bytes(message)));

		// The function `web3.eth.sign(...)` prepend the following 
		// string to the message and hash it again.
		bytes32 envelopedMsg = keccak256(
                abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
            );

		return recoverSigner(envelopedMsg, signature) == signer;
	}

	/**
	 * @dev It recovers the signer's address of a given signed message.
	 * Note If the signature is malformed it will return some unrelated address.
	 * That is why after recovering the address you want to compare it to the expected
	 * signer's address and consider it valid only if they match.
	 *
	 * @param messageHash The hash of the enveloped message that has been signed.
	 * @param signature The signature of the message.
	 *
	 * @return address The address related to the private key used to sign the message IF the signature is correct.
	 */
	function recoverSigner(bytes32 messageHash, bytes memory signature) public pure returns (address) {

		// The precompiled contract needs to be fed with the separate components of the signature
		(bytes32 r, bytes32 s, uint8 v) = splitSignature(signature);

		// Call the precompiled contract at 0x01
        return ecrecover(messageHash, v, r, s);
	}

	/**
	 * @dev It splits a digital signature in its three components, r, s and v.
	 *
	 * @param sig The digital signature to be splitted.
	 */
	function splitSignature(bytes memory sig) public pure returns (bytes32 r, bytes32 s, uint8 v) {
		require(sig.length == 65, "invalid signature length");

		assembly {
            /*
            First 32 bytes stores the length of the signature

            add(sig, 32) = pointer of sig + 32
            effectively, skips first 32 bytes of signature

            mload(p) loads next 32 bytes starting at the memory address p into memory
            */

            // first 32 bytes, after the length prefix
            r := mload(add(sig, 32))
            // second 32 bytes
            s := mload(add(sig, 64))
            // final byte (first byte of the next 32 bytes)
            v := byte(0, mload(add(sig, 96)))
        }

        // implicitly return (r, s, v)
    }

	function getHashReferenceFromReceiptID(bytes32 receiptID) public view returns(bytes32 hashedReference) {
		return receipts[receiptID].hashedReference;
	}

	/**
	 * @dev It checks if the `receipts` mapping has been already initialized at a certain key.
	 * Note The object `Receipt` always exists at every possible key with the default values for
	 * each field. If those values have never been initialized then they still have the default
	 * values and it can be considered as if it doesn't exist for any practical purposes.
	 *
	 * @param receiptID The unique identifier for the receipt used as a key in the `receipts` mapping.
	 *
	 * @return bool Returns TRUE if the receipt does NOT exist. Returns FALSE if it DOES exist.
	 */
	function receiptDoesNotExist(bytes32 receiptID) public view returns(bool) {

		Receipt memory receipt = receipts[receiptID];

		return
			receipt.hashedReference == bytes32(0) &&
			receipt.buyer == address(0) &&
			receipt.price == 0;
	}

	////// Failsafe //////

	function failSafe(bool _contractIsActive) public reservedForAdmin {
		contractIsActive = _contractIsActive;
	}

	////// Fallback //////

	fallback() external {
		revert("Fallback function triggered: invalid call to the contract");
	}
}
