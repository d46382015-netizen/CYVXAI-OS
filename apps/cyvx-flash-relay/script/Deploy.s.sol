// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/FlashArb.sol";

contract Deploy is Script {
    function run() external returns (FlashArb deployed) {
        address pool = vm.envAddress("AAVE_POOL_ADDRESS");
        address owner = vm.envAddress("OWNER_ADDRESS");
        address operator = vm.envAddress("OPERATOR_ADDRESS");
        require(pool != address(0), "AAVE_POOL_ADDRESS missing");
        require(owner != address(0), "OWNER_ADDRESS missing");
        require(operator != address(0), "OPERATOR_ADDRESS missing");
        require(block.chainid == 1 || block.chainid == 31337, "Unsupported chain");
        vm.startBroadcast();
        deployed = new FlashArb(pool, owner, operator);
        vm.stopBroadcast();
    }
}
