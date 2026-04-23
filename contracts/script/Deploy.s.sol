// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {PayrollManager} from "../src/PayrollManager.sol";

contract DeployScript is Script {
    // Arc testnet USDC system contract
    address constant USDC_ARC = 0x3600000000000000000000000000000000000000;

    function run() public returns (PayrollManager payroll) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("USDC:", USDC_ARC);

        vm.startBroadcast(deployerKey);
        payroll = new PayrollManager(USDC_ARC);
        vm.stopBroadcast();

        console.log("PayrollManager deployed at:", address(payroll));
    }
}
