# Transaction Processor – BD4NRG Marketplace

This repository contains a set of smart contracts written in Solidity and developed using Truffle. These smart contracts are the core component of the Marketplace in the [BD4NRG project](https://www.bd4nrg.eu/). The contracts are designed to be loosely coupled and work together with the Federated Catalogue, developed separately. The main contract is the Transaction Processor, which handles the registration of purchases of items, the storage of receipts on-chain, and the movement of funds from the buyer's address to the seller's. The funds are handled by a separate contract which implements a standard ERC20 contract.

## Quick Start-Up

After cloning the repository you will need to install the truffle framework:

    npm install -g truffle
  
Install the dependencies:

    npm install
  
Enter the development environment:

    truffle develop
    
Run the tests:

    test
    
**IMPORTANT**: With truffle you can normally run the tests directly from console with `truffle test`, however this would not work here because truffle would not expose the port to access the local blockchain. Conversely, when running `truffle develop` the local blockchain is exposed and you can access the local wallet. Access to the wallet is needed because the function `web3.eth.sign(message, signerAccount)` needs access to the private key of the signer's account in order to perform the signature.

If all tests run fine, the repo is correctly set-up and you can deploy your contracts in the local environment (or configure an environment of choice in `truffle-config.js`) and then you can directly interact with via console using Web3js ([a guide](https://medium.com/0xcode/interacting-with-smart-contracts-using-web3-js-34545a8a1ebd), [another guide](https://www.geeksforgeeks.org/interacting-with-ethereum-smart-contract-using-web3js/), there are many).

## Smart Contracts and Rationales

![image](https://user-images.githubusercontent.com/26814063/225882309-e40fb1c2-8368-4a79-9bab-ec62cbbeafc6.png)

The central contract holding the business logic is the implementation contract, where the rules of the Transaction Processor (TP) are coded. The tokens are handled separately by the Token Contract (TC), a standard ERC20. To ensure upgradability and a better bug resilience, the user is supposed to interact with a Proxy Contract (PC) that forwards all cals to the TP. The PC holds the address of the implementation contract and such address can be changed by, say, a (set of) marketplace operator(s). Assuming that the marketplace operator (MO) should not be one individual, the logic of the governance is embedded in the Admin Contract (AC). The admin address of the PC is meant to be set as the address of the AC.

`call` and `delegatecall` are highlighted in the scheme to clarify the context of execution of every call. In our scenario the relevant elements of the context are `msg.sender` and the storage. `delegatecall` preserves them – the context is the caller's – while `call` set the callee's context. This is crucial to understand the mechanics between contracts:

  - When a user calls a function of the TP via the PC, *all data generated is saved in the Proxy storage*, and `msg.sender` (also for the code written in the TP) is the user. This is because the function call is forwarded with `delegatecall`.
  - When an admin wants to perform a reserved operation in the proxy contract, *that operation is executed on the Proxy storage* and `msg.sender` is the AC. This is because the functin call is forwarded with `call`.
  - The TC uses its own storage, operations executed by a user through the TP are considered as performed by the TP. One of the implications is that the TP needs to be authorized to perform transfers for a buyer's account.

### Transaction Processor

The Transaction Processor (TP) serves as the shared source of truth for both buyers and sellers. It enables buyers to make purchases by submitting valid receipts created in cooperation with the sellers, and allows sellers to verify the validity of the receipts and grant access to the purchased items.

A receipt *in the smart contract* is an object containing the following information:
  - A hashed reference to the item purchased
  - The buyer's address
  - The price of the item

The smart contract stores all the receipts created and handles the logic of receipt creation.

The purchase functions checks that all the information supplied is correct, that funds are sufficient, and then creates the new receipt and moves funds.

The seller can as well verify that a receipt is valid by submitting a piece of random data signed by the seller.

### Proxy Contract
The Proxy contract (PC) is designed to forward calls (with delegation) to the TP, which means that when a function is called via the PC, the PC 'borrows' the logic of the function from the TP and executes it as if it was its own.

There are a number of reasons why it's a good idea to deploy a proxy contract:
  - Upgradeability: By using a proxy pattern, you can separate the contract's logic from its storage. This allows you to update the contract's logic without affecting its storage or state. This makes it easier to upgrade the contract without losing data or disrupting its functionality.
  - Security: If a bug is found in the implementation logic it can be substituted without losing the data stored previously.
  - Flexibility: By separating the contract's logic from its storage, you can use different implementations for different use cases or scenarios.

The PC also holds the addresses of both the implementation contract and the admin contract, and allows for changes to both. Those addresses are saved in a random position of the memory in order to avoid collision with storage generated by the implementation contract. This could otherwise happen because the current memory layout follows the unstructured pattern. Further enhancements could include the development of the diamond pattern to ensure separate storages between different implementation contracts.

### Admin Contract

The Administrator contract (AC) can be used to manage the PC. It is meant to be the administration point of the proxy contract and an example of the logics that can be used to handle decisions (unanimity, majority, etc.).

### Token Contract
The Token contract (TC) is a standard ERC20 contract meant to represent the exchange of value. This contract is imported by the Open Zeppelin libraries and does not include any specific customization because the design choices related to it are mainly political and have little to do with the technology. The token can be a stablecoin, an ad-hoc coins to be used only within the marketplace, there can be a fixed or unlimited supply, etc.. All those options are available and relatively easy to implement, it is more a matter of policy making than technical development.

## Privacy-Preserving Techniques
An initial intuitive design was made in such a way that a seller would put an item on sale through the TP, and buyers could independently buy items via the same TP. This design leaks a great amount of information about a seller's financial status. That is why a layer of privacy has been added with the implementation of the following protocol:

1. The buyer (B) goes to the seller (S) and says "I want to buy item ID".
2. S generates `H` = _hash_(`ID`+`nonce`)
3. S generates `H2` = _hash_(`H`+`price`)
4. S generates `X` = _ethSign_(`H2`), signature made with Ethereum address of choice to receive the funds
5. S generates `Y` = _sign_(`X`), signature made with a verifiable public certificate, for non-repudiation
6. S sends `ID`, `nonce`, `H`,  `H2`, `X` and `Y` to B
7. B verifies everything
8. B triggers the purchase and sends along *only* `X`, `H`, `H2`, `price` and nothing else
9. The smart contract, among other things, verifies that `H2` = _hash_(`H`+`price`) and then extracts the address from signature `X` and sends money there directly, hence there is no manual input from the user about the address and, while there is manual input for the price, that gets double-checked during execution.

Key points:
- Only point 8 and 9 actually happen on blockchain.
- Even if it is S to generate and control the Ethereum address they want to receive money at, it is B who sends the transaction containing the information of the receiving address – such information is implicit in `X` and can be extracted in the smart contract.
- In case of disputes, the users can prove that they used the correct `X` (and hence they sent money to the right party) by disclosing all the rest, and in particular `Y` which shows that S has signed that info.
- The combination of `X`, `H`, `H2` and B address is what is considered a _receipt_. Receipts are supposed to be unique because of the `nonce` that changes every time – and everything else changing as a result.

#### Resistance against reselling
For a receipt to be considered valid the buyer should have some residual funds on their address, as a measure to discourage the resell or disclosure of their private keys. This deposit is set to be equal to the price of the item (the price stored in the receipt). The rationale is that if a second-hand seller (shs) wants to sell access to more than the price in the receipt, then a second hand buyer (shb) has no reason to buy it from a shs instead of a legit dealer. On the other hand, if a shs wants to sell their private key at lower price than the one listed, then they immediately create an incentive for shb (even and especially uninterested buyers) to just purchase it and then wipe the funds, making a profit immediately while rendering the receipt unusable.

A receipt who is not valid due to lack of funds can still be cryptographically verified with `verifyReceiptFromID()`.

------
BD4NRG – Marketplace – Transaction Processor – 2023
