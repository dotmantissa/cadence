// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PayrollManager} from "../src/PayrollManager.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        require(allowance[from][msg.sender] >= amount, "not approved");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract PayrollManagerTest is Test {
    PayrollManager public payroll;
    MockUSDC public usdc;

    address employer = address(0x1);
    address employee = address(0x2);

    uint128 constant RATE = 1e6; // $1/sec
    uint128 constant DEPOSIT = 3600e6; // $3600 = 1 hour

    function setUp() public {
        usdc = new MockUSDC();
        payroll = new PayrollManager(address(usdc));

        usdc.mint(employer, 10000e6);
        vm.prank(employer);
        usdc.approve(address(payroll), type(uint256).max);
    }

    function test_CreateStream() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV-001");

        (address emp,,,,,,bool active,) = payroll.streams(id);
        assertEq(emp, employer);
        assertTrue(active);
    }

    function test_AccruesOverTime() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV-001");

        vm.warp(block.timestamp + 100);
        assertEq(payroll.accrued(id), 100e6); // $100 accrued
    }

    function test_EmployeeWithdraws() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV-001");

        vm.warp(block.timestamp + 60);
        vm.prank(employee);
        payroll.withdraw(id);

        assertEq(usdc.balanceOf(employee), 60e6);
    }

    function test_TopUp() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, RATE, "INV-001"); // 1-second deposit

        vm.warp(block.timestamp + 1);
        vm.prank(employee);
        payroll.withdraw(id);

        (, , , , , , bool active,) = payroll.streams(id);
        assertFalse(active);

        usdc.mint(employer, 1000e6);
        vm.prank(employer);
        usdc.approve(address(payroll), 1000e6);
        vm.prank(employer);
        payroll.topUp(id, 1000e6);

        (, , , , , , bool activeAfter,) = payroll.streams(id);
        assertTrue(activeAfter);
    }

    function test_CancelStream() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, DEPOSIT, "INV-001");

        vm.warp(block.timestamp + 10);
        uint256 empBefore = usdc.balanceOf(employee);
        uint256 emplBefore = usdc.balanceOf(employer);

        vm.prank(employer);
        payroll.cancelStream(id);

        assertEq(usdc.balanceOf(employee) - empBefore, 10e6); // 10 sec accrued
        assertEq(usdc.balanceOf(employer) - emplBefore, DEPOSIT - 10e6); // remainder refunded
    }

    function test_RunwayDecreases() public {
        vm.prank(employer);
        uint256 id = payroll.createStream(employee, RATE, 3600e6, "INV-001");
        assertEq(payroll.runway(id), 3600);

        vm.warp(block.timestamp + 600);
        assertEq(payroll.runway(id), 3000);
    }
}
