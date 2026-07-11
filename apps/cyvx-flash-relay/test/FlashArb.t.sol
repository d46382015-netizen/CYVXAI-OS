// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FlashArb.sol";

contract MockERC20 is IERC20Minimal {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;

    function mint(address recipient, uint256 amount) external {
        balanceOf[recipient] += amount;
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address recipient, uint256 amount) external override returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount)
        external
        override
        returns (bool)
    {
        uint256 current = allowance[sender][msg.sender];
        if (current != type(uint256).max) {
            require(current >= amount, "ALLOWANCE");
            allowance[sender][msg.sender] = current - amount;
        }
        _transfer(sender, recipient, amount);
        return true;
    }

    function _transfer(address sender, address recipient, uint256 amount) internal {
        require(balanceOf[sender] >= amount, "BALANCE");
        balanceOf[sender] -= amount;
        balanceOf[recipient] += amount;
    }
}

contract MockAavePool is IAavePoolMinimal {
    uint256 public immutable premiumBps;

    constructor(uint256 premiumBps_) {
        premiumBps = premiumBps_;
    }

    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16
    ) external override {
        uint256 premium = amount * premiumBps / 10_000;
        MockERC20(asset).mint(receiverAddress, amount);
        bool success = IAaveFlashLoanSimpleReceiver(receiverAddress).executeOperation(
            asset,
            amount,
            premium,
            receiverAddress,
            params
        );
        require(success, "CALLBACK");
        require(
            IERC20Minimal(asset).transferFrom(
                receiverAddress,
                address(this),
                amount + premium
            ),
            "REPAYMENT"
        );
    }
}

abstract contract MockRateEngine {
    mapping(bytes32 => uint256) internal rates;

    function setRate(address tokenIn, address tokenOut, uint256 rateE18) external {
        rates[keccak256(abi.encode(tokenIn, tokenOut))] = rateE18;
    }

    function consumeAndMint(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minimumOut,
        address recipient
    ) internal returns (uint256 amountOut) {
        amountOut = amountIn * rates[keccak256(abi.encode(tokenIn, tokenOut))] / 1e18;
        require(amountOut >= minimumOut, "MIN_OUT");
        IERC20Minimal(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        MockERC20(tokenOut).mint(recipient, amountOut);
    }
}

contract MockV2Router is IUniswapV2Router, MockRateEngine {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address recipient,
        uint256 deadline
    ) external override returns (uint256[] memory amounts) {
        require(block.timestamp <= deadline, "DEADLINE");
        require(path.length == 2, "PATH");
        uint256 amountOut = consumeAndMint(
            path[0], path[1], amountIn, amountOutMin, recipient
        );
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountOut;
    }
}

contract MockV3Router is IUniswapV3Router, MockRateEngine {
    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        override
        returns (uint256 amountOut)
    {
        require(block.timestamp <= params.deadline, "DEADLINE");
        amountOut = consumeAndMint(
            params.tokenIn,
            params.tokenOut,
            params.amountIn,
            params.amountOutMinimum,
            params.recipient
        );
    }
}

contract FlashArbTest is Test {
    address internal constant OWNER = address(0xA11CE);
    address internal constant OPERATOR = address(0xB0B);
    address internal constant ATTACKER = address(0xBAD);

    MockERC20 internal tokenA;
    MockERC20 internal tokenB;
    MockAavePool internal pool;
    MockV2Router internal v2;
    MockV3Router internal v3;
    FlashArb internal arb;

    function setUp() public {
        tokenA = new MockERC20();
        tokenB = new MockERC20();
        pool = new MockAavePool(5);
        v2 = new MockV2Router();
        v3 = new MockV3Router();
        arb = new FlashArb(address(pool), OWNER, OPERATOR);

        vm.startPrank(OWNER);
        arb.setTokenAllowed(address(tokenA), true);
        arb.setTokenAllowed(address(tokenB), true);
        arb.setRouterAllowed(address(v2), true);
        arb.setRouterAllowed(address(v3), true);
        vm.stopPrank();
    }

    function testProfitableRouteRepaysLoanAndStoresProfit() public {
        uint256 amount = 100_000 ether;
        v3.setRate(address(tokenA), address(tokenB), 1e18);
        v2.setRate(address(tokenB), address(tokenA), 101e16);
        (FlashArb.Leg memory first, FlashArb.Leg memory second) = _route(amount, 100_500 ether);

        vm.prank(OPERATOR);
        arb.executeArbitrage(
            address(tokenA), amount, 500 ether, block.timestamp + 60, first, second
        );

        assertEq(tokenA.balanceOf(address(pool)), 100_050 ether);
        assertEq(tokenA.balanceOf(address(arb)), 950 ether);
    }

    function testUnprofitableRouteRevertsAtomically() public {
        uint256 amount = 100_000 ether;
        v3.setRate(address(tokenA), address(tokenB), 1e18);
        v2.setRate(address(tokenB), address(tokenA), 1e18);
        (FlashArb.Leg memory first, FlashArb.Leg memory second) = _route(amount, amount);

        vm.expectRevert(FlashArb.Unprofitable.selector);
        vm.prank(OPERATOR);
        arb.executeArbitrage(
            address(tokenA), amount, 1, block.timestamp + 60, first, second
        );
        assertEq(tokenA.balanceOf(address(pool)), 0);
        assertEq(tokenA.balanceOf(address(arb)), 0);
    }

    function testTreasuryCannotMaskLosingTrade() public {
        uint256 amount = 100_000 ether;
        tokenA.mint(address(arb), 1_000 ether);
        v3.setRate(address(tokenA), address(tokenB), 1e18);
        v2.setRate(address(tokenB), address(tokenA), 1e18);
        (FlashArb.Leg memory first, FlashArb.Leg memory second) = _route(amount, amount);

        vm.expectRevert(FlashArb.Unprofitable.selector);
        vm.prank(OPERATOR);
        arb.executeArbitrage(
            address(tokenA), amount, 0, block.timestamp + 60, first, second
        );
        assertEq(tokenA.balanceOf(address(arb)), 1_000 ether);
    }

    function testOnlyOperatorCanExecute() public {
        (FlashArb.Leg memory first, FlashArb.Leg memory second) = _route(1 ether, 1 ether);
        vm.expectRevert(FlashArb.NotOperator.selector);
        vm.prank(ATTACKER);
        arb.executeArbitrage(
            address(tokenA), 1 ether, 0, block.timestamp + 60, first, second
        );
    }

    function testPauseStopsExecution() public {
        vm.prank(OWNER);
        arb.setPaused(true);
        (FlashArb.Leg memory first, FlashArb.Leg memory second) = _route(1 ether, 1 ether);
        vm.expectRevert(FlashArb.ContractPaused.selector);
        vm.prank(OPERATOR);
        arb.executeArbitrage(
            address(tokenA), 1 ether, 0, block.timestamp + 60, first, second
        );
    }

    function _route(uint256 firstMinimum, uint256 secondMinimum)
        internal
        view
        returns (FlashArb.Leg memory first, FlashArb.Leg memory second)
    {
        first = FlashArb.Leg({
            kind: FlashArb.DexKind.V3,
            router: address(v3),
            tokenIn: address(tokenA),
            tokenOut: address(tokenB),
            fee: 500,
            minAmountOut: firstMinimum
        });
        second = FlashArb.Leg({
            kind: FlashArb.DexKind.V2,
            router: address(v2),
            tokenIn: address(tokenB),
            tokenOut: address(tokenA),
            fee: 0,
            minAmountOut: secondMinimum
        });
    }
}
