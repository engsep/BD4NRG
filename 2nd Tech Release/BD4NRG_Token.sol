// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.7.0 <0.9.0;

contract BD4NRG_Token {
    string public name = "BD4NRG Token";
    string public symbol = unicode"BĐ4T";
    uint256 private totalSupply = 1000000;
    address private owner;
    mapping(address => uint256) balances;
    event Transfer(address indexed _from, address indexed _to, uint256 _value);

    constructor() {
        balances[msg.sender] = totalSupply;
        owner = msg.sender;
    }

    function transfer(address to, uint256 amount) external {
        require(balances[msg.sender] >= amount, "Not enough tokens");
        balances[msg.sender] -= amount;
        balances[to] += amount;
        emit Transfer(msg.sender, to, amount);
    }

    function getBalance(address account) external view returns (uint256) {
        return balances[account];
    }
}