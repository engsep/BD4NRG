// The default host for truffle testing is 'http://localhost:9545'
// Check the network configuration in truffle-config if you customize
// the network, and update networkProvider accordingly
const networkProvider = 'http://localhost:9545'

const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider(networkProvider));
const crypto = require("crypto");
const truffleAssert = require('truffle-assertions');

const BD4NRGToken = artifacts.require("BD4NRGToken");
const TransactionProcessor = artifacts.require("TransactionProcessor");
const ProxyContract = artifacts.require("Proxy");
const AdminContract = artifacts.require("AdminContract");

contract('Transaction Processor', (accounts) => {

  let TransactionProcessorInstance;
  let tokenContractInstance;
  let testData;
  let testPrice;
  let buyer = accounts[1]
  let seller = accounts[2]
  let otherAddress = accounts[3]
  var receipts = []
  var currentBalance

  beforeEach(async () => {
    tokenContractInstance = await BD4NRGToken.deployed();
    TransactionProcessorInstance = await TransactionProcessor.deployed();

    testData = "0x1234567890abcdef01231234567890abcdef0123";
    testPrice = 30;
  });

  it('First purchase', async () => {

    // Giving both buyer and seller some tokens
    await tokenContractInstance.transfer(buyer, 100)
    await tokenContractInstance.transfer(seller, 100)
    
    // Storing initial balances
    balanceBuyer_initial = await getTokenBalanceOf(buyer, tokenContractInstance)
    balanceSeller_initial = await getTokenBalanceOf(seller, tokenContractInstance)

    // The buyer wants to trigger the purchase, but they first need to authorize
    // the smart contract to spend their tokens
    await tokenContractInstance.increaseAllowance(TransactionProcessorInstance.address, testPrice, {from: buyer})

    // The seller creates a new receipt
    receipts[0] = await createNewReceipt(testData, testPrice, seller)
 
    // The buyer calls the smart contract to register the purchase
    await TransactionProcessorInstance.purchase(receipts[0].signature, receipts[0].hashedRefWithNonce, receipts[0].receiptID, testPrice, {from: buyer})
    
    // Storing final balances
    balanceBuyer_final = await getTokenBalanceOf(buyer, tokenContractInstance)
    balanceSeller_final = await getTokenBalanceOf(seller, tokenContractInstance)
 
    // Check balances
    assert.equal(balanceBuyer_final, balanceBuyer_initial - testPrice, "The final balance of the buyer must be equal to original balance minus purchase price")
    assert.equal(balanceSeller_final, balanceSeller_initial + testPrice, "The final balance of the seller must be equal to original balance plus purchase price")

    // Check the purchase is registered
    const itemRef = await TransactionProcessorInstance.getHashReferenceFromReceiptID(receipts[0].receiptID)
    assert.equal(receipts[0].hashedRefWithNonce, itemRef, "The receipt must be registered correctly in the receipts array")
  });

  it('Registering the same receipt fails', async () => {

    await truffleAssert.reverts(
      TransactionProcessorInstance.purchase(receipts[0].signature, receipts[0].hashedRefWithNonce, receipts[0].receiptID, testPrice, {from: buyer}),
      "The receiptID you are using is already associated to another receipt"
      )

  })

  it('Purchase with funds less than the price fails', async () => {

    currentBalance = await getTokenBalanceOf(buyer, tokenContractInstance)

    // Set the price just a little higher than buyer's current balance
    const price = currentBalance + 1

    const receipt = await createNewReceipt(testData, price, seller)

    // Should revert because with the set price the buyer can't afford it.
    await truffleAssert.reverts(
      TransactionProcessorInstance.purchase(receipt.signature, receipt.hashedRefWithNonce, receipt.receiptID, price, {from: buyer}),
      "Deposit is insufficient"
      )

  })

  it('Purchase with funds less than twice the price fails', async () => {

    currentBalance = await getTokenBalanceOf(buyer, tokenContractInstance)

    // Set the price just a little higher than half of the buyer's funds.
    const price = Math.floor(currentBalance / 2) + 1

    const receipt = await createNewReceipt(testData, price, seller)

    // Should revert because the contract enforces a minimum deposit of twice the item's price,
    // in order to discourage reselling of the receipt (the buyer could otherwise just share their private key)
    await truffleAssert.reverts(
      TransactionProcessorInstance.purchase(receipt.signature, receipt.hashedRefWithNonce, receipt.receiptID, price, {from: buyer}),
      "Deposit is insufficient"
      )

  })

  it('Submitting the wrong price fails', async () => {

    currentBalance = await getTokenBalanceOf(buyer, tokenContractInstance)

    // Price set to be enough, including deposit
    const price = Math.floor(currentBalance / 2)

    const receipt = await createNewReceipt(testData, price, seller)

    // Should fail because it submits a different price
    await truffleAssert.reverts(
      TransactionProcessorInstance.purchase(receipt.signature, receipt.hashedRefWithNonce, receipt.receiptID, price-1, {from: buyer}),
      "The price or the hash does not match with the receipt"
      )

  })

  it('Submitting the wrong hash fails', async () => {

    currentBalance = await getTokenBalanceOf(buyer, tokenContractInstance)

    // Price set to be enough, including deposit
    const price = Math.floor(currentBalance / 2)

    const receipt = await createNewReceipt(testData, price, seller)

    const randomHash = web3.utils.keccak256('definitely the wrong hash')

    // Should fail because it submit a different hash
    await truffleAssert.reverts(
      TransactionProcessorInstance.purchase(receipt.signature, randomHash, receipt.receiptID, price, {from: buyer}),
      "The price or the hash does not match with the receipt"
      )

  })

  it('Purchasing without pre-approving a sufficient allowance fails', async () => {

    // Second legit receipt is created
    receipts[1] = await createNewReceipt(testData, testPrice, seller)
 
    // Should fail because the buyer has to approve the smart contract to spend the buyer's tokens
    await truffleAssert.reverts(
      TransactionProcessorInstance.purchase(receipts[1].signature, receipts[1].hashedRefWithNonce, receipts[1].receiptID, testPrice, {from: buyer}),
      "ERC20: insufficient allowance"
      )

  })

  it('Second purchase', async () => {

    // The buyer authorizes the smart contract to spend their tokens for the second purchase
    await tokenContractInstance.increaseAllowance(TransactionProcessorInstance.address, testPrice, {from: buyer})
    
    // Storing initial balances
    balanceBuyer_initial = await getTokenBalanceOf(buyer, tokenContractInstance)
    balanceSeller_initial = await getTokenBalanceOf(seller, tokenContractInstance)

    // Purchase
    await TransactionProcessorInstance.purchase(receipts[1].signature, receipts[1].hashedRefWithNonce, receipts[1].receiptID, testPrice, {from: buyer})
    
    // Storing final balances
    balanceBuyer_final = await getTokenBalanceOf(buyer, tokenContractInstance)
    balanceSeller_final = await getTokenBalanceOf(seller, tokenContractInstance)
 
    // Check balances
    assert.equal(balanceBuyer_final, balanceBuyer_initial - testPrice, "The final balance of the buyer must be equal to original balance minus purchase price")
    assert.equal(balanceSeller_final, balanceSeller_initial + testPrice, "The final balance of the seller must be equal to original balance plus purchase price")

    // Check the purchase is registered
    const itemRef = await TransactionProcessorInstance.getHashReferenceFromReceiptID(receipts[1].receiptID)
    assert.equal(receipts[1].hashedRefWithNonce, itemRef, "The receipt must be registered correctly in the receipts array")

  })

  it('Signature from a different address results in invalid receipt', async () => {

    // Sign a random nonce
    const nonce = generateNonce()    
    signedNonce = await web3.eth.sign(web3.utils.keccak256(nonce), otherAddress)

    // Check validity of receipts
    for(receipt of receipts) {
      // Should return false because the signature was not performed by the legit buyer recorded in the original receipt
      receiptIsVerified = await TransactionProcessorInstance.receiptIsValid(receipt.receiptID, nonce, signedNonce)
      assert.equal(receiptIsVerified, false, "The receipt should not be valid")
    }

  })

  it('Signature of the wrong nonce results in invalid receipt', async () => {

    // Sign a random nonce
    const nonce = generateNonce()
    const wrongNonce = generateNonce()
    signedNonce = await web3.eth.sign(web3.utils.keccak256(wrongNonce), buyer)

    // Check validity of receipts
    for(receipt of receipts) {
      // Should fail because even though the signature comes from the legit buyer, the piece of data signed was different
      receiptIsVerified = await TransactionProcessorInstance.receiptIsValid(receipt.receiptID, nonce, signedNonce)
      assert.equal(receiptIsVerified, false, "The receipt should not be valid")
      }

  })

  it('Successful verification of receipt', async () => {

    // Sign a random nonce
    const nonce = generateNonce()
    signedNonce = await web3.eth.sign(web3.utils.keccak256(nonce), buyer)

    // Check validity of receipts
    for(receipt of receipts) {
      receiptIsVerified = await TransactionProcessorInstance.receiptIsValid(receipt.receiptID, nonce, signedNonce)
      assert.equal(receiptIsVerified, true, "The receipt must be valid")
    }

  })

  it('Insufficient funds result in invalid receipt', async () => {

    // Difference between buyer's funds and the minimum deposit required by the receipt (the price of the item)
    const difference = await getTokenBalanceOf(buyer, tokenContractInstance) - testPrice
    
    // Transfer away just a little above the aforementioned difference
    await tokenContractInstance.transfer(accounts[0], difference + 1, {from: buyer})

    // Sign a random nonce
    const nonce = generateNonce()
    signedNonce = await web3.eth.sign(web3.utils.keccak256(nonce), buyer)

    // Check validity of receipts
    for(receipt of receipts) {
      await truffleAssert.reverts(
        // Should fail because for a receipt to be valid, the buyer must hold an amount of funds
        // equal to the price listed in the receipt, in order to discourage reselling.
        TransactionProcessorInstance.receiptIsValid(receipt.receiptID, nonce, signedNonce),
        "Deposit is insufficient"
      )
    }

  })
  
  it('Receipt is cryptographically valid although funds are insufficient', async () => {

    // Sign a random nonce
    const nonce = generateNonce()
    signedNonce = await web3.eth.sign(web3.utils.keccak256(nonce), buyer)

    // Check validity of receipts
    for(receipt of receipts) {
      // The cryptographic validity of the signature can still be checked regardless the funds of the buyer
      receiptIsVerified = await TransactionProcessorInstance.verifyReceiptFromID(receipt.receiptID, nonce, signedNonce)
      assert.equal(receiptIsVerified, true, "The receipt must verify")
    }

  })

  it('Verify Signature - Generic Test', async () => {

    const msg = 'ciao'
    const signer = accounts[0]

    // web3.eth.sign(...) works only if networkProvider is set properly
    // Conversely, the library can't access to the private key needed for the signature
    signedMsg = await web3.eth.sign(web3.utils.keccak256(msg), signer)

    isSignatureVerified = await TransactionProcessorInstance.verifySignature(signer, msg, signedMsg)

    assert.equal(isSignatureVerified, true, "Signature must verify")
  })
});

contract('Transaction Processor via Proxy', (accounts) => {

  let TransactionProcessorInstance;
  let tokenContractInstance;
  let testData = "0x1234567890abcdef01231234567890abcdef0123";
  let testPrice = 30;
  let admin = accounts[0]
  let buyer = accounts[1]
  let seller = accounts[2]
  let otherAddress = accounts[3]
  var receipts = []
  var currentBalance

  beforeEach(async () => {
    tokenContractInstance = await BD4NRGToken.deployed();
    TransactionProcessorInstance = await TransactionProcessor.deployed();
    proxyInstance = await ProxyContract.deployed()
  });

  it('Initial setup - Not a test', async () => {

    // Set the address of the implementation contract
    await proxyInstance.upgradeTo(TransactionProcessorInstance.address)

    // Retrieve the address of the implementation from the proxy storage
    // and verify that it's the right one
    const implAddr = await proxyInstance.implementation()
    assert.equal(implAddr, TransactionProcessorInstance.address, "Implementation address not properly set")

    // Prepare and send the transaction to initialize the Transactions Processor
    // contract in the context of the Proxy
    txObject = await prepareTxObjectForProxyContractCall("initializer(address)", ["address"], [tokenContractInstance.address])
    txObject.from = admin

    await web3.eth.sendTransaction(txObject)

    // Giving both buyer and seller some tokens
    await tokenContractInstance.transfer(buyer, 100)
    await tokenContractInstance.transfer(seller, 100)

  })

  it('First purchase', async () => {
    
    // Storing initial balances
    balanceBuyer_initial = await getTokenBalanceOf(buyer, tokenContractInstance)
    balanceSeller_initial = await getTokenBalanceOf(seller, tokenContractInstance)

    // The buyer wants to trigger the purchase, but they first need to authorize
    // the smart contract to spend their tokens. Unlike when testing the transaction processor
    // directly, here the contract to authorize is the proxy because when it delegates call the context
    // is preserved (it is effectively the proxy contract who is making the call to the token contract).
    await tokenContractInstance.increaseAllowance(proxyInstance.address, testPrice, {from: buyer})

    // The seller hash the reference of the item with a nonce and signs it
    receipts[0] = await createNewReceipt(testData, testPrice, seller)

    // Purchase - preparation and submission of the transaction
    txObject = await preparePurchaseTxObject(receipts[0], buyer)

    await web3.eth.sendTransaction(txObject)
    
    // Storing final balances
    balanceBuyer_final = await getTokenBalanceOf(buyer, tokenContractInstance)
    balanceSeller_final = await getTokenBalanceOf(seller, tokenContractInstance)
 
    // Check balances
    assert.equal(balanceBuyer_final, balanceBuyer_initial - testPrice, "The final balance of the buyer must be equal to original balance minus purchase price")
    assert.equal(balanceSeller_final, balanceSeller_initial + testPrice, "The final balance of the seller must be equal to original balance plus purchase price")

    // Check that the purchase is registered
    txObject = await prepareTxObjectForProxyContractCall("getHashReferenceFromReceiptID(bytes32)", ["bytes32"], [receipts[0].receiptID])
    txObject.from = seller

    const itemRef = await web3.eth.call(txObject)

    assert.equal(receipts[0].hashedRefWithNonce, itemRef, "The receipt must be registered correctly in the receipts array")
  });

  it('Registering the same receipt fails', async () => {

    // Purchase of the same first item with same receiptID - preparation and submission of the transaction
    txObject = await preparePurchaseTxObject(receipts[0], buyer)

    await truffleAssert.reverts(
      web3.eth.sendTransaction(txObject)
      )

  })

  it('Purchase with funds less than the price fails', async () => {

    currentBalance = await getTokenBalanceOf(buyer, tokenContractInstance)

    // Set the price just a little higher than buyer's current balance
    const price = currentBalance + 1

    const receipt = await createNewReceipt(testData, price, seller)
    
    txObject = await preparePurchaseTxObject(receipt, buyer)

    // Should revert because with the set price the buyer can't afford it.
    await truffleAssert.reverts(
      web3.eth.sendTransaction(txObject)
      )

  })

  it('Purchase with funds less than twice the price fails', async () => {

    currentBalance = await getTokenBalanceOf(buyer, tokenContractInstance)

    // Set the price just a little higher than half of the buyer's funds.
    const price = Math.floor(currentBalance / 2) + 1

    const receipt = await createNewReceipt(testData, price, seller)
    
    txObject = await preparePurchaseTxObject(receipt, buyer)

    // Should revert because the contract enforces a minimum deposit of twice the item's price,
    // in order to discourage reselling of the receipt (the buyer could otherwise just share their private key)
    await truffleAssert.reverts(
      web3.eth.sendTransaction(txObject)
      )

  })

  it('Submitting the wrong price fails', async () => {

    currentBalance = await getTokenBalanceOf(buyer, tokenContractInstance)

    // Price set to be enough, including deposit
    const price = Math.floor(currentBalance / 2)

    const receipt = await createNewReceipt(testData, price, seller)
    
    txObject = await preparePurchaseTxObject(receipt, buyer, price-1)

    // Should fail because it submits a different price
    await truffleAssert.reverts(
      web3.eth.sendTransaction(txObject)
      )

  })

  it('Submitting the wrong hash fails', async () => {

    currentBalance = await getTokenBalanceOf(buyer, tokenContractInstance)

    // Price set to be enough, including deposit
    const price = Math.floor(currentBalance / 2)

    var receipt = await createNewReceipt(testData, price, seller)

    receipt.hashedRefWithNonce = web3.utils.keccak256('definitely the wrong hash')
    
    txObject = await preparePurchaseTxObject(receipt, buyer)

    // Should fail because it submit a different hash
    await truffleAssert.reverts(
      web3.eth.sendTransaction(txObject)
      )

  })

  it('Purchasing without pre-approving a sufficient allowance fails', async () => {

    // Second legit receipt is created
    receipts[1] = await createNewReceipt(testData, testPrice, seller)
    
    txObject = await preparePurchaseTxObject(receipts[1], buyer)

    // Should fail because the buyer has to approve the smart contract to spend the buyer's tokens
    await truffleAssert.reverts(
      web3.eth.sendTransaction(txObject)
      )

  })

  it('Second purchase', async () => {

    // The buyer wants to trigger the purchase, but they first need to authorize
    // the smart contract to spend their tokens
    await tokenContractInstance.increaseAllowance(proxyInstance.address, testPrice, {from: buyer})
    
    // Storing initial balances
    balanceBuyer_initial = await getTokenBalanceOf(buyer, tokenContractInstance)
    balanceSeller_initial = await getTokenBalanceOf(seller, tokenContractInstance)

    // Purchase - preparation of transaction   
    txObject = await preparePurchaseTxObject(receipts[1], buyer)

    await web3.eth.sendTransaction(txObject)
    
    // Storing final balances
    balanceBuyer_final = await getTokenBalanceOf(buyer, tokenContractInstance)
    balanceSeller_final = await getTokenBalanceOf(seller, tokenContractInstance)
 
    // Check balances
    assert.equal(balanceBuyer_final, balanceBuyer_initial - testPrice, "The final balance of the buyer must be equal to original balance minus purchase price")
    assert.equal(balanceSeller_final, balanceSeller_initial + testPrice, "The final balance of the seller must be equal to original balance plus purchase price")

    // Check the purchase is registered
    txObject = await prepareTxObjectForProxyContractCall("getHashReferenceFromReceiptID(bytes32)", ["bytes32"], [receipts[1].receiptID])
    txObject.from = seller

    const itemRef = await web3.eth.call(txObject)
    assert.equal(receipts[1].hashedRefWithNonce, itemRef, "The receipt must be registered correctly in the receipts array")

  })

  it('Signature from a different address results in invalid receipt', async () => {

    // Sign a random nonce
    const nonce = generateNonce()    
    signedNonce = await web3.eth.sign(web3.utils.keccak256(nonce), otherAddress)

    // Check validity of receipts
    for(receipt of receipts) {
      txObject = await prepareReceiptVerificationTxObject(receipt.receiptID, nonce, signedNonce)
      txObject.from = seller
      // Should return false because the signature was not performed by the legit buyer recorded in the original receipt
      receiptIsVerified = await web3.eth.call(txObject)
      assert.equal(receiptIsVerified, false, "The receipt should not be valid")
    }

  })

  it('Signature of the wrong nonce results in invalid receipt', async () => {

    // Sign a random nonce
    const nonce = generateNonce()
    const wrongNonce = generateNonce()
    signedNonce = await web3.eth.sign(web3.utils.keccak256(wrongNonce), buyer)

    // Check validity of receipts
    for(receipt of receipts) {
      txObject = await prepareReceiptVerificationTxObject(receipt.receiptID, nonce, signedNonce)
      txObject.from = seller
      // Should fail because even though the signature comes from the legit buyer, the piece of data signed was different
      receiptIsVerified = await web3.eth.call(txObject)
      assert.equal(receiptIsVerified, false, "The receipt should not be valid")
      }

  })

  it('Successful verification of receipt', async () => {

    // Sign a random nonce
    const nonce = generateNonce()
    signedNonce = await web3.eth.sign(web3.utils.keccak256(nonce), buyer)

    // Check validity of receipts
    for(receipt of receipts) {
      txObject = await prepareReceiptVerificationTxObject(receipt.receiptID, nonce, signedNonce)
      txObject.from = seller
      receiptIsVerified = await web3.eth.call(txObject)
      assert.equal(receiptIsVerified, true, "The receipt must be valid")
    }

  })

  it('Insufficient funds result in invalid receipt', async () => {

    // Difference between buyer's funds and the minimum deposit required by the receipt (the price of the item)
    const difference = await getTokenBalanceOf(buyer, tokenContractInstance) - testPrice
    
    // Transfer away just a little above the aforementioned difference
    await tokenContractInstance.transfer(accounts[0], difference + 1, {from: buyer})

    // Sign a random nonce
    const nonce = generateNonce()
    signedNonce = await web3.eth.sign(web3.utils.keccak256(nonce), buyer)

    // Check validity of receipts
    for(receipt of receipts) {
      txObject = await prepareReceiptVerificationTxObject(receipt.receiptID, nonce, signedNonce)
      txObject.from = seller

      // Should fail because for a receipt to be valid, the buyer must hold an amount of funds
      // equal to the price listed in the receipt, in order to discourage reselling.
      await truffleAssert.reverts(
        web3.eth.call(txObject)
      )
    }

  })
  
  it('Receipt is cryptographically valid although funds are insufficient', async () => {

    // Sign a random nonce
    const nonce = generateNonce()
    signedNonce = await web3.eth.sign(web3.utils.keccak256(nonce), buyer)

    // Check validity of receipts
    for(receipt of receipts) {
      txObject = await prepareTxObjectForProxyContractCall(
      "verifyReceiptFromID(bytes32,bytes,bytes)",
      ["bytes32", "bytes", "bytes"],
      [receipt.receiptID, nonce, signedNonce]
      )
      txObject.from = seller
      
      // The cryptographic validity of the signature can still be checked regardless the funds of the buyer
      receiptIsVerified = await web3.eth.call(txObject)
      assert.equal(receiptIsVerified, true, "The receipt must verify")
    }

  })

  it('Verify Signature - Generic Test', async () => {

    const msg = 'ciao'
    const signer = accounts[0]

    // web3.eth.sign(...) works only if networkProvider is set properly
    // Conversely, the library can't access to the private key needed for the signature
    signedMsg = await web3.eth.sign(web3.utils.keccak256(msg), signer)

    txObject = await prepareTxObjectForProxyContractCall("verifySignature(address,string,bytes)", ["address", "string", "bytes"], [signer, msg, signedMsg])

    isSignatureVerified = await web3.eth.call(txObject)

    assert.equal(isSignatureVerified, true, "Signature must verify")
  })
});

contract('Admin Contract', (accounts) => {

  let TransactionProcessorInstance;
  let tokenContractInstance;

  beforeEach(async () => {
    tokenContractInstance = await BD4NRGToken.deployed();
    TransactionProcessorInstance = await TransactionProcessor.deployed();
    proxyInstance = await ProxyContract.deployed()
    adminContract = await AdminContract.deployed()
  });

  it('Initial setup', async () => {

    // Redeploy the transaction processor contract at a new address
    TransactionProcessorInstance = await TransactionProcessor.new(tokenContractInstance.address)

    // Set the address of the implementation contract
    await proxyInstance.upgradeTo(TransactionProcessorInstance.address)

    // Retrieve the address of the implementation from the proxy storage
    // and verify that it's the right one
    const implAddr = await proxyInstance.implementation()
    assert.equal(implAddr, TransactionProcessorInstance.address, "Implementation address not properly set")

    // Set the proxy admin as the Admin Contract
    await proxyInstance.changeAdmin(adminContract.address)
    
    // Check that the address of the admin of the proxy is set as the admin contract
    const adminAddr = await proxyInstance.admin()
    assert.equal(adminAddr, adminContract.address, "Admin contract address not properly set")

  })

  it('Change implementation contract - via admin contract', async () => {
    
    // Redeploy the transaction processor contract at a new address
    TransactionProcessorInstance_2 = await TransactionProcessor.new(tokenContractInstance.address)
    assert.equal(TransactionProcessorInstance.address == TransactionProcessorInstance_2.address, false, "New contract address must be different from the previous one")

    // Preapprove the new address of the implementation contract
    await adminContract.approveNewImplementationAddress(TransactionProcessorInstance_2.address)

    // Effectively change the address of the implementation contract
    await adminContract.changeImplementationAddress(TransactionProcessorInstance_2.address)

    // Check the change happened correctly
    const implAddr_2 = await adminContract.implementationAddress()
    assert.equal(implAddr_2, TransactionProcessorInstance_2.address, "Implementation address not changed properly")

  })

  it('Add new admins', async () => {
    
    let newAdmins = [accounts[1], accounts[2]]

    // Add the new set of admins to the admin contract
    for(let newAdmin of newAdmins) {
      await adminContract.addNewAdmin(newAdmin)
    }
    
    // Verify that new admins are active
    for(let newAdmin of newAdmins) {
      check = await adminContract.isAdmin(newAdmin)
      await assert.equal(check, true, "New admin must be registered correctly")      
    }
    })

  it('Changing implementation contract without approval of all admins fails - via admin contract', async () => {
    
    // Redeploy the transaction processor contract at a new address
    TransactionProcessorInstance_3 = await TransactionProcessor.new(tokenContractInstance.address)
    assert.equal(TransactionProcessorInstance_2.address == TransactionProcessorInstance_3.address, false, "New contract address must be different from the previous one")

    // Should fail because it doesn't have preapproval of all admins
    await truffleAssert.reverts(
      adminContract.changeImplementationAddress(TransactionProcessorInstance_3.address)
    )
  })

  it('Change implementation contract with multiple admins - via admin contract', async () => {

    let admins = [accounts[0], accounts[1], accounts[2]]

    // All admin approve the new address of the implementation contract
    for(let admin of admins) {
      await adminContract.approveNewImplementationAddress(TransactionProcessorInstance_3.address, {from: admin})
    }
    
    // One of the admin can effectively change the implementation contract address
    await adminContract.changeImplementationAddress(TransactionProcessorInstance_3.address)

    // Check the change happened correctly
    const implAddr_3 = await adminContract.implementationAddress()
    assert.equal(implAddr_3, TransactionProcessorInstance_3.address, "Implementation address not changed properly")
  })

});

/**
 * @dev Generates a nonce by hashing 20 random bytes.
 * 
 * @returns {string} Hash of 20 random bytes.
 */
function generateNonce() {
  return web3.utils.keccak256(
    crypto.randomBytes(20).toString('hex')      
  )
}

/**
 * @dev Creates the information needed to submit a purchase (a receipt)
 *
 * @param {string} reference Represents the link with the off-chain item, it's a unique
 * reference generated by the seller and ideally publicly posted.
 * @param {number} price The price set by the seller.
 * @param {address} signer The address generating the signature of the receiptID, the same
 * address to which funds will be moved to from the buyer (in the practice always
 * the seller address)
 * 
 * @returns {Object} Contains the hashed reference, the receiptID, the signature and the price.
 */
async function createNewReceipt(reference, price, signer) {

  // Computing hash(reference + nonce). The nonce is there to break
  // the link between the reference and the hash that goes posted on-chain.
  const nonce = generateNonce()
  const hashedRefWithNonce = web3.utils.keccak256(reference + nonce)

  // Receipt ID is computed as hash(H1+price), where H1 is the hash computed at the previous step.
  const receiptID = web3.utils.keccak256(
    web3.utils.encodePacked(hashedRefWithNonce, price)
  )

  // The receipt ID is signed (normally by the seller)
  const signature = await web3.eth.sign(receiptID, signer)

  return {
    hashedRefWithNonce: hashedRefWithNonce,
    receiptID: receiptID,
    signature: signature,
    price: price
  }
}

/**
 * @dev Wraps the call to the token contract to improve readability in the tests.
 *
 * @param {address} address Address whose balance you want to check.
 * @param {address} tokenContractInstance Address of the ERC20 smart contract where you want to check the balance.
 * 
 * @returns {number} Amount of tokens in `tokenContractInstance` owned by `address`, as an integer.
 */
async function getTokenBalanceOf(address, tokenContractInstance) {
  let balance;
  await tokenContractInstance.balanceOf(address).then( function(balanceBN) { balance = balanceBN.toNumber() })
  
  return balance
}

/**
 * @dev Prepares the transaction object needed by sendTransaction method.
 * It encodes the function signature and the parameters and prepare them for
 * the `data` field of the tx object.
 *
 * @param {string} functionSignature The signature of the function to call (e.g.: `purchase(bytes,bytes32,bytes32,uint256)` ).
 * @param {array[string]} paramsTypes An array storing the types of the ordered parameters (e.g.: `["bytes", "bytes32", "bytes32", "uint256"]` ).
 * @param {array} params An array with the actual parameters to pass to the function.
 * 
 * @returns {object} Transaction object with the fields `to` (proxy address), `data` and `gas`.
 */
async function prepareTxObjectForProxyContractCall(functionSignature, paramsTypes, params) {
  
  const encodedFunctionSignature = web3.eth.abi.encodeFunctionSignature(functionSignature)
  const encodedFunctionSignatureAndParameters = encodedFunctionSignature + web3.eth.abi.encodeParameters(paramsTypes, params).substr(2);

  return {
    to: proxyInstance.address,
    data: encodedFunctionSignatureAndParameters,

    // When using the proxy contract gas needs to be set high because the automatic estimation
    // does not account for the execution in the implementation contract, and thus it always
    // falls short. The default value must be overwritten with a larger one. Unused gas is returned.
    gas: 1000000
  }
}

/**
 * @dev Wraps the `prepareTxObjectForProxyContractCall` function to easily prepare a purchase transaction.
 * 
 * @param {object} receipt The receipt generated by the seller.
 * @param {address} buyer Buyer's address.
 * @param {number} price The price of the item referenced in the receipt.
 * 
 * @returns {object} Transaction object with the fields `to` (proxy address), `from` (the buyer),
 * `data` (the proper encoding for a purchase call) and `gas`.
 */
async function preparePurchaseTxObject(receipt, buyer, price) {

  // Javascript way of overloading: the function can be called
  // without providing the price explicitly
  if(price = 'undefined') price = receipt.price

  var txObject = await prepareTxObjectForProxyContractCall(
    "purchase(bytes,bytes32,bytes32,uint256)",
    ["bytes", "bytes32", "bytes32", "uint256"],
    [receipt.signature, receipt.hashedRefWithNonce, receipt.receiptID, price]
    )
  txObject.from = buyer
  return txObject
}

/**
 * @dev Wraps the `prepareTxObjectForProxyContractCall` function to easily prepare a receipt verification transaction.
 * 
 * @param {string} receiptID hash(hashedReference+price), used as unique identifier of a receipt.
 * @param {string} nonce Random nonce.
 * @param {string} signedNonce Signature of the nonce.
 * 
 * @returns {object} Transaction object with the fields `to` (proxy address),
 * `data` (the proper encoding for a receipt verification call) and `gas`.
 */
async function prepareReceiptVerificationTxObject(receiptID, nonce, signedNonce) {
  return await prepareTxObjectForProxyContractCall(
    "receiptIsValid(bytes32,bytes,bytes)",
    ["bytes32", "bytes", "bytes"],
    [receiptID, nonce, signedNonce]
    )
}